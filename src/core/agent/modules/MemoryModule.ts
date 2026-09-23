import { z } from 'zod';

import { HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { IPromptSection, PromptSectionIndex } from '@supernova/events/IBus';

import { JsonGraphRepository, SubgraphResult } from '../../memory';
import {
    GRAPH_EXTRACTOR_PROMPT, GRAPH_EXTRACTOR_SCHEMA, GraphExtractionResult
} from '../../memory/prompts';
import { IAgentContext, IAgentModule, RunContext } from '../types';

/**
 * 記憶模組配置選項
 */
export interface MemoryModuleOptions {
    /** 知識圖譜倉儲實例 (外部單例注入，基於 BaseJsonRepository 與 Vectra) */
    repository: JsonGraphRepository;
    /** 所屬會話 ID (若未從 AgentContext 獲取時備用) */
    sessionId?: string;
    /** 向量檢索召回 Top-K 實體數 (預設 3) */
    topK?: number;
    /** 圖譜鄰居展開深度 (預設 1) */
    subgraphDepth?: number;
    /** 是否開啟背景非同步知識萃取 (預設 true) */
    enableAutoExtraction?: boolean;
    /** 萃取模型使用的 Preset 名稱 (預設 'extraction'，若無則降級為宿主 preset) */
    extractionPresetName?: string;
}

/**
 * 長期記憶與語意圖譜器官模組 (MemoryModule)
 * 遵循 V2 組合式模組架構 (IAgentModule)：
 * 1. 優先級 priority = 20 (在 Profile 5 與 History 10 之後，在思考規劃之前)
 * 2. 依賴 requires = ['profile', 'history']
 * 3. onBeforeRun: 依據使用者輸入進行向量相似度檢索與子圖展開，注入 PromptSectionIndex.MEMORY_CONTEXT (3)
 * 4. onAfterRun: 背景非同步發起實體與三元組萃取，自動更新知識圖譜與向量庫
 * 5. getTools: 提供 recall_memory 主動檢索工具
 */
export class MemoryModule implements IAgentModule {
    /** 模組識別名稱 */
    public readonly name: string = 'memory';

    /** 執行優先級：20 */
    public readonly priority: number = 20;

    /** 前置依賴器官 */
    public readonly requires: string[] = ['profile', 'history'];

    private readonly repository: JsonGraphRepository;
    private readonly sessionId?: string;
    private readonly topK: number;
    private readonly subgraphDepth: number;
    private readonly enableAutoExtraction: boolean;
    private readonly extractionPresetName: string;

    private context?: IAgentContext;

    constructor(options: MemoryModuleOptions) {
        this.repository = options.repository;
        this.sessionId = options.sessionId;
        this.topK = options.topK ?? 3;
        this.subgraphDepth = options.subgraphDepth ?? 1;
        this.enableAutoExtraction = options.enableAutoExtraction ?? true;
        this.extractionPresetName = options.extractionPresetName ?? 'extraction';
    }

    public onAttach(context: IAgentContext): void {
        this.context = context;
    }

    public onDetach(): void {
        this.context = undefined;
    }

    /**
     * 推理步驟前切面 (onBeforeRun)
     * 檢索相關長期記憶實體與圖譜，注入 MEMORY_CONTEXT (3) 提示詞區塊
     */
    public async onBeforeRun(context: RunContext): Promise<void> {
        if (!this.context) return;

        const currentSessionId = this.sessionId ?? this.context.sessionId;
        if (!currentSessionId) return;

        // 提取使用者最新的輸入內容
        const lastUserMessage = [...context.messages]
            .reverse()
            .find((m) => m instanceof HumanMessage || (m as any)._getType?.() === 'human');

        const queryText =
            typeof lastUserMessage?.content === 'string'
                ? lastUserMessage.content.trim()
                : '';

        if (!queryText) return;

        try {
            // 嘗試取得 Embeddings 模型生成向量
            const embeddings = this.context.llmProvider.getEmbeddings();
            const queryVector = await embeddings.embedQuery(queryText);

            // 執行向量檢索與子圖拓撲展開
            const subgraph: SubgraphResult = await this.repository.searchGraphContext(
                currentSessionId,
                queryVector,
                this.topK,
                this.subgraphDepth
            );

            // 若召回相關節點，組裝結構化 Markdown 區塊
            if (subgraph.nodes.length > 0) {
                const sectionContent = this.formatSubgraphToMarkdown(subgraph);
                context.promptSections.push({
                    index: PromptSectionIndex.MEMORY_CONTEXT,
                    content: sectionContent
                });
            }
        } catch {
            // 向量檢索失敗（例如無網路或 Mock 環境）視為非致命降級，不阻斷對話
        }
    }

    /**
     * 推理步驟後切面 (onAfterRun)
     * 背景非同步抽取對話中的長期知識與三元組，寫入知識圖譜與向量庫
     */
    public async onAfterRun(context: RunContext): Promise<void> {
        if (!this.enableAutoExtraction || !this.context) return;

        const currentSessionId = this.sessionId ?? this.context.sessionId;
        if (!currentSessionId) return;

        // 提取本輪對話文本
        const lastUserMessage = [...context.messages]
            .reverse()
            .find((m) => m instanceof HumanMessage || (m as any)._getType?.() === 'human');

        const userInput = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
        const agentOutput = typeof context.output === 'string' ? context.output : '';

        if (!userInput && !agentOutput) return;

        const conversationText = `User: ${userInput}\nAgent: ${agentOutput}`;

        // 背景非同步萃取，不阻斷使用者獲得回覆
        this.extractMemory(conversationText, currentSessionId).catch(() => {});
    }

    /**
     * 手動萃取對話內容並寫入知識圖譜與向量庫
     * 支援外部測試腳本或主動調度器呼叫並等待落盤
     * @param conversationText 要提取實體與關係的對話文本
     * @param targetSessionId 可選指定 Session ID，預設使用當前模組綁定之 Session
     */
    public async extractMemory(conversationText: string, targetSessionId?: string): Promise<void> {
        const sessionId = targetSessionId ?? this.sessionId ?? this.context?.sessionId;
        if (!sessionId) {
            throw new Error('Cannot extract memory: Session ID is missing');
        }
        await this.extractMemoryInBackground(sessionId, conversationText);
    }


    /**
     * 提供模型主動調用之記憶檢索工具
     */
    public getTools(): any[] {
        return [
            new DynamicStructuredTool({
                name: 'recall_memory',
                description: 'Search long-term memory and knowledge graph for facts, user preferences, and historical entities.',
                schema: z.object({
                    query: z.string().describe('The topic, entity name, or keyword to recall'),
                    limit: z.number().optional().default(3).describe('Maximum number of memory entities to retrieve'),
                }),
                func: async ({ query, limit }: { query: string; limit?: number }) => {
                    const currentSessionId = this.sessionId ?? this.context?.sessionId;
                    if (!currentSessionId || !this.context) {
                        return 'Memory recall unavailable: session not initialized.';
                    }

                    try {
                        const embeddings = this.context.llmProvider.getEmbeddings();
                        const queryVector = await embeddings.embedQuery(query);
                        const subgraph = await this.repository.searchGraphContext(
                            currentSessionId,
                            queryVector,
                            limit ?? this.topK,
                            this.subgraphDepth
                        );

                        if (subgraph.nodes.length === 0) {
                            return `No relevant memory found for "${query}".`;
                        }

                        return this.formatSubgraphToMarkdown(subgraph);
                    } catch (err: any) {
                        return `Memory recall error: ${err.message}`;
                    }
                },
            }),
        ];
    }

    /**
     * 將子圖節點與關聯邊格式化為緊湊的 Markdown 格式
     */
    private formatSubgraphToMarkdown(subgraph: SubgraphResult): string {
        const lines: string[] = ['# Long-Term Knowledge Graph Memory'];

        lines.push('## Relevant Entities:');
        for (const n of subgraph.nodes) {
            lines.push(`- [${n.label}] ${n.id}: ${n.memory}`);
        }

        if (subgraph.edges.length > 0) {
            lines.push('## Semantic Relations:');
            for (const e of subgraph.edges) {
                lines.push(`- (${e.sourceId}) -[${e.relation}]-> (${e.targetId})`);
            }
        }

        return lines.join('\n');
    }

    /**
     * 背景非同步萃取實體與三元組
     */
    private async extractMemoryInBackground(
        sessionId: string,
        conversationText: string
    ): Promise<void> {
        if (!this.context) return;

        let model: any;
        try {
            model = this.context.llmProvider.getModel(this.extractionPresetName);
        } catch {
            // 若無專用 extraction preset，降級使用預設模型
            model = this.context.llmProvider.getModel();
        }

        // 若模型支援 structuredOutput 則優先使用，確保結構安全
        let extraction: GraphExtractionResult;
        const prompt = GRAPH_EXTRACTOR_PROMPT.replace('{conversation}', conversationText);

        if (typeof model.withStructuredOutput === 'function') {
            const structuredModel = model.withStructuredOutput(GRAPH_EXTRACTOR_SCHEMA);
            extraction = await structuredModel.invoke(prompt);
        } else {
            // Mock 或純文字降級解析
            const res = await model.invoke(prompt);
            const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
            try {
                extraction = JSON.parse(content);
            } catch {
                return;
            }
        }

        if (!extraction || !Array.isArray(extraction.entities)) return;

        const embeddings = this.context.llmProvider.getEmbeddings();

        // 1. 寫入實體節點 (Nodes)
        for (const entity of extraction.entities) {
            let embedding: number[] | undefined;
            try {
                embedding = await embeddings.embedQuery(`${entity.id}: ${entity.description}`);
            } catch {}

            await this.repository.addNode(sessionId, {
                id: entity.id,
                label: entity.type,
                memory: entity.description,
                embedding,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }

        // 2. 寫入關係邊 (Edges)
        if (Array.isArray(extraction.relations)) {
            for (const rel of extraction.relations) {
                await this.repository.addEdge(sessionId, {
                    id: `edge_${rel.sourceEntityId}_${rel.predicate}_${rel.targetEntityId}`,
                    sourceId: rel.sourceEntityId,
                    targetId: rel.targetEntityId,
                    relation: rel.predicate,
                    properties: { context: rel.sourceContext },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }
        }
    }
}
