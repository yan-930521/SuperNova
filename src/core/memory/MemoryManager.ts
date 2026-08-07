import { PromptTemplate } from '@langchain/core/prompts';

import { LLMProvider } from '../agent/LLMProvider';
import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { GraphEdge, GraphNode, IGraphRepository } from '../infra/persistence/IGraphRepository';
import { IDataBlockRepository } from '../infra/persistence/IRepository';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { DataBlock } from '../messaging/DataBlock';
import {
    AgentEvent, HookEvent, IEvent, IEventBus, PromptSectionIndex, SystemEvent
} from '../messaging/IBus';
import { IdGenerator } from '../utils/IdGenerator';
import { GRAPH_EXTRACTOR_PROMPT, GRAPH_EXTRACTOR_TYPE, SESSION_SUMMARY_PROMPT } from './prompt';

/**
 * 記憶萃取引擎 (Memory Manager)
 * 負責將對話歷史 (DataBlocks/Oplog) 轉換為 Graph Memory 節點與邊。
 */
export class MemoryManager implements ILifecycle {
    private readonly logger = LogManager.recorder;

    constructor(
        private readonly config: Config,
        private readonly graphRepo: IGraphRepository,
        private readonly dataBlockRepo: IDataBlockRepository,
        private readonly eventBus: IEventBus,
        private readonly llmProvider: LLMProvider
    ) { }

    private extractingSessions = new Set<string>();

    // 用於換日防打斷機制的狀態
    private lastMessageTimes = new Map<string, number>();
    private pendingOptimizations = new Map<string, string>(); // sessionId -> dayToSummarize
    private currentLogicalDayStr: string = "";
    private lastTickCheckTime: number = 0;

    public async initialize(): Promise<void> {
        this.logger.info('[MemoryManager] Initializing Memory Manager...');

        this.currentLogicalDayStr = this.getLogicalDateStr(Date.now(), this.config.agent.daily_optimization_time);

        // 訂閱事件
        this.eventBus.subscribe(SystemEvent.SessionClosed, this.handleSessionClosed.bind(this));
        this.eventBus.subscribe(AgentEvent.AgentMessage, this.handleAgentMessage.bind(this));
        this.eventBus.subscribe(SystemEvent.SessionOptimization, this.handleSessionOptimization.bind(this));
        this.eventBus.subscribe(SystemEvent.Tick, this.handleTick.bind(this));
        this.eventBus.subscribe(HookEvent.BeforeAgentStep, this.handleBeforeAgentStep.bind(this));
    }

    public async start(): Promise<void> {
        this.logger.info('[MemoryManager] Started.');
    }

    public async stop(): Promise<void> {
        this.logger.info('[MemoryManager] Stopping...');
    }

    /**
     * 處理 Session 關閉事件，觸發非同步的圖譜萃取
     */
    private async handleSessionClosed(event: IEvent<SystemEvent.SessionClosed>): Promise<void> {
        if (!this.config.agent.enable_graph_memory) return;
        
        const sessionId = event.payload.sessionId;
        if (!sessionId) return;

        if (this.extractingSessions.has(sessionId)) return;

        this.logger.info(`[MemoryManager] Triggering background memory extraction for closed session: ${sessionId}`);

        this.extractingSessions.add(sessionId);
        try {
            const agentIds = await this.dataBlockRepo.listAgentsForSession(sessionId);
            for (const agentId of agentIds) {
                this.extractAndSaveSessionMemory(sessionId, agentId)
                    .catch(err => {
                        this.logger.error(`[MemoryManager] Failed to extract memory for session ${sessionId}, agent ${agentId}: ${err.message}`);
                    });
            }
        } catch (err: any) {
            this.logger.error(`[MemoryManager] Error fetching agents for closed session ${sessionId}: ${err.message}`);
        } finally {
            this.extractingSessions.delete(sessionId);
        }
    }

    /**
     * 處理即時訊息事件，當未萃取的記憶達到上限時自動觸發萃取
     */
    private async handleAgentMessage(event: IEvent<AgentEvent.AgentMessage>): Promise<void> {
        const rawPayload = event.payload;
        if (!rawPayload) return;

        const blocks = Array.isArray(rawPayload) ? rawPayload : [rawPayload];
        if (blocks.length === 0) return;

        const sessionId = blocks[0].sessionId;
        if (!sessionId) return;

        // 更新最後對話時間，用於換日防打斷機制
        this.lastMessageTimes.set(sessionId, Date.now());

        if (!this.config.agent.enable_graph_memory) return;

        // 如果目前正在背景萃取，則略過檢查
        if (this.extractingSessions.has(sessionId)) return;

        try {
            const agentIds = await this.dataBlockRepo.listAgentsForSession(sessionId);
            for (const agentId of agentIds) {
                const allBlocks = await this.dataBlockRepo.findByAgent(sessionId, agentId);
                if (!allBlocks) continue;

                const unextractedBlocks = allBlocks.filter(b => !b.isExtracted && (b.type === 'human' || b.type === 'ai'));
                if (unextractedBlocks.length >= this.config.agent.memory_extract_threshold) {
                    this.logger.info(`[MemoryManager] Unextracted blocks for agent ${agentId} reached threshold (${this.config.agent.memory_extract_threshold}). Triggering background extraction...`);

                    this.extractingSessions.add(sessionId);
                    this.extractAndSaveSessionMemory(sessionId, agentId)
                        .catch(err => {
                            this.logger.error(`[MemoryManager] Failed to extract memory for session ${sessionId}, agent ${agentId}: ${err.message}`);
                        })
                        .finally(() => {
                            this.extractingSessions.delete(sessionId);
                        });
                }
            }
        } catch (err: any) {
            this.logger.error(`[MemoryManager] Error checking extraction threshold: ${err.message}`);
        }
    }

    /**
     * 處理 BeforeAgentStep，實作動態上下文檢索 (Dynamic Context Retrieval)
     * 利用 cosine similarity 找出圖譜中與當前對話最相關的節點並注入 Prompt。
     */
    private async handleBeforeAgentStep(event: IEvent<HookEvent.BeforeAgentStep>): Promise<void> {
        if (!this.config.agent.enable_graph_memory) return;

        const context = event.payload;
        if (!context || !context.currentMessages || context.currentMessages.length === 0) return;

        try {
            // 找出最後一筆用戶或系統輸入作為檢索用的 Query
            const lastMsg = context.currentMessages[context.currentMessages.length - 1];
            let queryText = lastMsg.toMarkdown();

            // 若長度不足或為空，可以考慮不檢索，或結合歷史
            if (queryText.length < 3) return;

            // 產生 Query 的向量
            const queryEmbedding = await this.llmProvider.generateEmbeddings(queryText);

            // 在 Repository 中尋找最相近的 TopK 節點並向外擴展深度為 2 的子圖
            const graphContext = await this.graphRepo.searchGraphContext(event.sessionId || "global", queryEmbedding, 5, 2);
            
            if (graphContext && graphContext.nodes.length > 0) {
                // 將檢索出的節點轉為文字格式注入 System Prompt
                let memoryContext = "## RETRIEVED GRAPH MEMORY CONTEXT\n";
                memoryContext += "Based on your current input, the following related entities and concepts were retrieved from your long-term memory:\n\n";

                memoryContext += "### Entities:\n";
                graphContext.nodes.forEach((node) => {
                    memoryContext += `- [${node.label}] ${node.id}: ${node.memory}\n`;
                });

                if (graphContext.edges.length > 0) {
                    memoryContext += "\n### Relations:\n";
                    graphContext.edges.forEach((edge) => {
                        memoryContext += `- ${edge.sourceId} --[${edge.relation}]--> ${edge.targetId}\n`;
                    });
                }

                if (!context.injectedPrompts) {
                    context.injectedPrompts = [];
                }
                
                context.injectedPrompts.push({
                    index: PromptSectionIndex.MEMORY_CONTEXT,
                    content: memoryContext
                });
                
                this.logger.info(`[MemoryManager] Injected ${graphContext.nodes.length} graph memory nodes and ${graphContext.edges.length} edges for context retrieval.`);
            }
        } catch (err: any) {
            this.logger.error(`[MemoryManager] Failed to retrieve dynamic context: ${err.message}`);
        }
    }

    /**
     * 處理每日優化：生成總結、記錄檔案並輪替
     */
    private async handleSessionOptimization(event: IEvent<SystemEvent.SessionOptimization>): Promise<void> {
        const sessionId = event.payload.sessionId;
        this.logger.info(`[MemoryManager] Starting daily session optimization for session ${sessionId}...`);

        try {
            const agentIds = await this.dataBlockRepo.listAgentsForSession(sessionId);

            for (const agentId of agentIds) {
                const allBlocks = await this.dataBlockRepo.findByAgent(sessionId, agentId);
                if (!allBlocks || allBlocks.length === 0) continue;

                const dialogueLines = allBlocks
                    .filter(b => b.type === 'human' || b.type === 'ai')
                    .map(b => `${b.type === 'human' ? 'User' : 'Assistant'}: ${b.controlPayload}`);

                const dialogue = dialogueLines.join('\n');

                if (dialogue.trim().length > 0) {
                    const dateStr = event.payload.targetDate;

                    if (this.config.agent.enable_daily_summary) {
                        const summaryPrompt = PromptTemplate.fromTemplate(SESSION_SUMMARY_PROMPT);
                        const model = this.llmProvider.getModel('EXTRACTION');

                        const summaryChain = summaryPrompt.pipe(model);

                        this.logger.info(`[MemoryManager] Generating daily summary...`);
                        const response = await summaryChain.invoke({ conversation: dialogue });

                        // 儲存總結 (檔名可以加上 agentId 以免覆蓋)
                        const summaryMarkdownStr = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
                        await this.dataBlockRepo.saveDailySummary(sessionId, `${dateStr}_${agentId}`, summaryMarkdownStr);
                    }

                    await this.dataBlockRepo.rotateHistoryFile(sessionId, agentId, dateStr);
                }

                this.logger.info(`[MemoryManager] Session optimization completed for session ${sessionId}.`);
            }
        } catch (err: any) {
            this.logger.error(`[MemoryManager] Session optimization failed for session ${sessionId}: ${err.message}`);
        }
    }

    /**
     * 處理 Tick 引擎的心跳事件，負責觸發換日優化任務
     */
    private async handleTick(event: IEvent<SystemEvent.Tick>): Promise<void> {
        // 降低頻率：根據 config 設定的間隔檢查 (預設 30 秒)
        const checkInterval = this.config.agent.daily_optimization_check_interval_ms;
        if (event.timestamp - this.lastTickCheckTime < checkInterval) {
            return;
        }
        this.lastTickCheckTime = event.timestamp;

        const todayLogicalStr = this.getLogicalDateStr(event.timestamp, this.config.agent.daily_optimization_time);

        // 偵測到換日
        if (this.currentLogicalDayStr !== todayLogicalStr) {
            this.logger.info(`[MemoryManager] Logical day flipped from ${this.currentLogicalDayStr} to ${todayLogicalStr}. Scheduling daily optimizations...`);

            const dayToSummarize = this.currentLogicalDayStr;
            this.currentLogicalDayStr = todayLogicalStr;

            // 將所有近期活動過的 Session 加入待優化佇列
            for (const sessionId of this.lastMessageTimes.keys()) {
                this.pendingOptimizations.set(sessionId, dayToSummarize);
            }
        }

        // 檢查是否有待優化的 Session 滿足靜默條件
        const IDLE_THRESHOLD = this.config.agent.daily_optimization_idle_threshold_ms;

        for (const [sessionId, targetDate] of this.pendingOptimizations.entries()) {
            const lastTime = this.lastMessageTimes.get(sessionId) || 0;
            if (event.timestamp - lastTime >= IDLE_THRESHOLD) {
                this.logger.info(`[MemoryManager] Session ${sessionId} has been idle for ${IDLE_THRESHOLD / 1000}s after logical day flip. Triggering optimization...`);
                this.pendingOptimizations.delete(sessionId);

                this.eventBus.publish({
                    type: SystemEvent.SessionOptimization,
                    timestamp: event.timestamp,
                    payload: { sessionId, targetDate },
                    sessionId
                });
            }
        }
    }

    /**
     * 計算指定時間的邏輯日期 (YYYY-MM-DD)。
     * 如果當前時間還沒超過 config 指定的換日時間 (例如 "03:00")，則算作前一天。
     */
    private getLogicalDateStr(timestamp: number, optTimeStr: string): string {
        const d = new Date(timestamp);
        let cfgH = 0, cfgM = 0;

        if (optTimeStr && optTimeStr.includes(':')) {
            const parts = optTimeStr.split(':').map(Number);
            cfgH = parts[0] || 0;
            cfgM = parts[1] || 0;
        }

        const currentH = d.getHours();
        const currentM = d.getMinutes();

        // 若時間早於換日時間，歸屬於前一天
        if (currentH < cfgH || (currentH === cfgH && currentM < cfgM)) {
            d.setTime(d.getTime() - 86400000);
        }

        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    }

    /**
     * 從對話歷史中萃取並保存記憶圖譜
     * @param sessionId 當前的 Session ID
     * @param agentId 要萃取歷史的 Agent ID (預設 main)
     * @param agentName Agent 名稱
     * @param userIName 使用者 名稱
     */
    public async extractAndSaveSessionMemory(sessionId: string, agentId: string = 'main', agentName: string = "AI", userName: string = "User"): Promise<void> {
        // 從資料庫載入該 Agent 的所有對話歷史
        const blocks = await this.dataBlockRepo.findByAgent(sessionId, agentId);
        if (!blocks || blocks.length === 0) return;

        // 過濾出尚未萃取 (isExtracted !== true) 且為對話類型 ('human' 或是 'ai') 的 Block
        const unextractedBlocks = blocks.filter(b => !b.isExtracted && (b.type === 'human' || b.type === 'ai'));
        if (unextractedBlocks.length === 0) {
            this.logger.debug(`[MemoryManager] No new blocks to extract for session ${sessionId}, agent ${agentId}.`);
            return;
        }

        const BATCH_SIZE = this.config.agent.memory_extract_threshold;
        for (let i = 0; i < unextractedBlocks.length; i += BATCH_SIZE) {
            const batchBlocks = unextractedBlocks.slice(i, i + BATCH_SIZE);

            // 將過濾出的 DataBlocks 轉換為對話文本字串
            const dialogueLines = batchBlocks.map(b => `${b.type === 'human' ? userName : agentName}: ${b.controlPayload}`);
            const dialogue = dialogueLines.join('\n');

            if (!dialogue || dialogue.trim().length === 0) {
                await this.markBlocksAsExtracted(sessionId, agentId, blocks, batchBlocks);
                continue;
            }

            const model = this.llmProvider.getModel('EXTRACTION');

            // ==========================================
            // 1. 單一階段：直接提煉對話中的事實為圖譜三元組
            // ==========================================
            const graphPrompt = PromptTemplate.fromTemplate(GRAPH_EXTRACTOR_PROMPT);
            const graphChain = graphPrompt.pipe(model.withStructuredOutput(GRAPH_EXTRACTOR_TYPE));

            this.logger.debug(`[MemoryManager] Extracting factual graph triples for session ${sessionId} (${agentId}) batch ${i / BATCH_SIZE + 1}...`);
            const graphResult = await graphChain.invoke({ conversation: dialogue });

            if (!graphResult.entities || graphResult.entities.length === 0) {
                this.logger.debug(`[MemoryManager] No entities extracted in this batch.`);
                await this.markBlocksAsExtracted(sessionId, agentId, blocks, batchBlocks);
                continue;
            }

            this.logger.debug(`[MemoryManager] Successfully extracted ${graphResult.entities.length} entities and ${graphResult.relations?.length || 0} relations.`);

            // ==========================================
            // 2. 第二階段：沉澱至圖譜資料庫 (Graph Repository)
            // ==========================================
            
            // 先儲存所有實體節點 (Nodes)
            for (const entity of graphResult.entities) {
                const nodeId = `Entity:${entity.id.trim().replace(/\s+/g, '_')}`;
                
                let node = await this.graphRepo.getNode(sessionId, nodeId);
                if (!node) {
                    this.logger.debug(`[MemoryManager] Generating embedding for new node: ${entity.id}`);
                    // 將 description 加入記憶體文本，增加向量比對的語意豐富度
                    const memoryText = `${entity.id}: ${entity.description}`;
                    const embedding = await this.llmProvider.generateEmbeddings(memoryText);
                    
                    node = {
                        id: nodeId,
                        label: entity.type || "Entity",
                        memory: memoryText,
                        embedding,
                        properties: { original_id: entity.id, description: entity.description },
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    await this.graphRepo.addNode(sessionId, node);
                } else {
                    // 若存在則可以選擇是否更新 properties/description
                    // 這裡暫時維持原樣不覆蓋
                }
            }

            // 再儲存關係邊 (Edges)
            if (graphResult.relations) {
                for (const relation of graphResult.relations) {
                    const sourceNodeId = `Entity:${relation.sourceEntityId.trim().replace(/\s+/g, '_')}`;
                    const targetNodeId = `Entity:${relation.targetEntityId.trim().replace(/\s+/g, '_')}`;
                    
                    const edge: GraphEdge = {
                        id: IdGenerator.graphEdge(),
                        sourceId: sourceNodeId,
                        targetId: targetNodeId,
                        relation: relation.predicate,
                        properties: { sourceContext: relation.sourceContext },
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    await this.graphRepo.addEdge(sessionId, edge);
                }
            }

            await this.markBlocksAsExtracted(sessionId, agentId, blocks, batchBlocks);
            this.logger.info(`[MemoryManager] Batch ${i / BATCH_SIZE + 1} memory graph persistence completed.`);
        }
    }

    /**
     * 將已經萃取過的 DataBlock 標記為 isExtracted = true，並覆寫回 Repository
     */
    private async markBlocksAsExtracted(
        sessionId: string,
        agentId: string,
        allBlocks: readonly DataBlock<any>[],
        extractedBlocks: DataBlock<any>[]
    ): Promise<void> {
        // 直接在記憶體中修改 isExtracted 標記
        for (const block of extractedBlocks) {
            block.isExtracted = true;
        }

        // 將更新後的整個陣列寫回 Repository
        await this.dataBlockRepo.saveForAgent(sessionId, agentId, [...allBlocks]);
    }
}
