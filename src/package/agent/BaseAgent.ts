import * as path from 'path';
import * as fs from 'fs';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { Config } from '../../core/config/Config';
import { LogManager } from '../../core/infra/LogManager';
import { ConsoleTransport } from '../../core/infra/transports/ConsoleTransport';
import { FileTransport } from '../../core/infra/transports/FileTransport';
import { DataBlock } from '../../core/messaging/DataBlock';
import { IEventBus, IEvent } from '../../core/messaging/IBus';

/**
 * Agent 的純粹生命週期狀態
 */
export enum AgentState {
  /** 建構與綁定基礎設施中 */
  INITIALIZING = 'INITIALIZING',
  /** 就緒並等待事件 */
  IDLE = 'IDLE',
  /** 正在處理業務邏輯 (子類別負責定義自己在忙什麼) */
  BUSY = 'BUSY',
  /** 掛起中，主動釋放資源 */
  SUSPENDED = 'SUSPENDED',
  /** 已安全銷毀 */
  TERMINATED = 'TERMINATED'
}

/**
 * 資源消耗統計介面
 */
export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

/**
 * 所有 Agent 的抽象基底類別 (BaseAgent)
 * 整合了 Session 綁定、上下文綁定日誌 (Contextual Logger)、資源計量、狀態持久化、事件驅動與 LangChain。
 */
export abstract class BaseAgent {
  /** 當前生命週期狀態 */
  protected state: AgentState;
  /** 上下文綁定的專屬 Logger (不會污染全局) */
  protected readonly logger: LogManager;
  
  /** 訊息收件箱 */
  protected inbox: DataBlock[] = [];
  /** 資源消耗累積統計 */
  protected usageStats: UsageStats = { promptTokens: 0, completionTokens: 0, durationMs: 0 };
  
  protected readonly oplogDir: string;
  protected readonly stateFilePath: string;
  private readonly eventHandler: (event: IEvent<string, DataBlock>) => void;

  constructor(
    public readonly id: string,
    public readonly sessionId: string, // 強制綁定會話 ID，所有衍生 Agent/Worker 均依附於此會話
    protected readonly eventBus: IEventBus,
    protected readonly config: Config
  ) {
    this.state = AgentState.INITIALIZING;
    
    // 注入專屬的 Contextual Logger，追蹤這個 Agent 的所有行為
    this.logger = new LogManager({ agent_id: this.id, session_id: this.sessionId, type: 'AGENT' });
    // 安裝 Console 傳輸器，並使用 [Agent:<id>] 作為前綴標籤，以避免日誌調用時重複添加前綴
    this.logger.addTransport(new ConsoleTransport('DEBUG', `[Agent:${this.id}]`));
    
    // 根據 Session ID 與 Agent ID，自動掛載實體的 Oplog 檔案傳輸器，實作會話級別的物理隔離
    this.oplogDir = path.join(
      process.cwd(), 
      this.config.storage.base_dir, 
      'sessions',
      this.sessionId,
      this.config.storage.agent_dir || 'agents', 
      this.id
    );
    this.logger.addTransport(new FileTransport('DEBUG', this.oplogDir, '.oplog.jsonl'));
    this.stateFilePath = path.join(this.oplogDir, 'state.json');
    
    this.logger.info(`Initializing agent: ${this.id} under session: ${this.sessionId}`);

    // 事件訂閱：自動向 EventBus 註冊監聽自己 id 的事件
    this.eventHandler = this.handleEvent.bind(this);
    this.eventBus.subscribe(this.id, this.eventHandler);
  }

  // ==========================================
  // LangChain 整合 (LLM & Prompt Helpers)
  // ==========================================

  /**
   * 獲取該 Agent 使用的 LangChain Chat Model 實例。由子類別決定具體模型。
   */
  protected abstract getModel(): BaseChatModel;

  /**
   * 讓子類別實作專屬的業務處理邏輯 (例如：處理收到的 DataBlock)
   */
  protected abstract processInbox(messages: DataBlock[]): Promise<void>;

  /**
   * 組合 Prompt 範本、變數、歷史紀錄與環境上下文，生成 LangChain 訊息陣列
   */
  protected async compileMessages(
    systemTemplate: string,
    userTemplate: string,
    variables: Record<string, any> = {},
    options?: {
      envPrompt?: string;
      history?: BaseMessage[];
    }
  ): Promise<BaseMessage[]> {
    const promptTemplates: any[] = [];

    // 1. 系統提示詞
    promptTemplates.push(['system', systemTemplate]);

    // 2. 注入具身智能環境上下文 (若有)
    if (options?.envPrompt) {
      promptTemplates.push(['system', `[ENVIRONMENT CONTEXT]\n${options.envPrompt}`]);
    }

    // 3. 建立 ChatPromptTemplate
    const chatPrompt = ChatPromptTemplate.fromMessages(promptTemplates);
    const formattedMessages = await chatPrompt.formatMessages(variables);

    // 4. 合併歷史紀錄與使用者最終輸入
    const finalMessages: BaseMessage[] = [];
    finalMessages.push(...formattedMessages);

    if (options?.history && options.history.length > 0) {
      finalMessages.push(...options.history);
    }

    // 使用者最終 Prompt 組合
    const userPromptTemplate = ChatPromptTemplate.fromMessages([
      ['human', userTemplate]
    ]);
    const formattedUserMessages = await userPromptTemplate.formatMessages(variables);
    finalMessages.push(...formattedUserMessages);

    return finalMessages;
  }

  /**
   * 呼叫 LLM 模型並整合重試邏輯與 Token/執行時間統計
   */
  protected async callModel(
    messages: BaseMessage[],
    options?: {
      maxRetries?: number;
    }
  ): Promise<string> {
    const model = this.getModel();
    
    // 使用 LangChain 的 .withRetry 封裝重試邏輯
    const modelWithRetry = model.withRetry({
      stopAfterAttempt: options?.maxRetries ?? 3,
    });

    const startTime = Date.now();
    try {
      const response = await modelWithRetry.invoke(messages);
      const durationMs = Date.now() - startTime;

      // 提取 Token 消耗統計
      const usageMetadata = (response as any).usage_metadata;
      if (usageMetadata) {
        this.recordUsage(
          usageMetadata.input_tokens ?? 0,
          usageMetadata.output_tokens ?? 0,
          durationMs
        );
      } else {
        // 退一步檢查 response.additional_kwargs 中的 tokenUsage
        const tokenUsage = (response.additional_kwargs as any)?.tokenUsage;
        if (tokenUsage) {
          this.recordUsage(
            tokenUsage.promptTokens ?? 0,
            tokenUsage.completionTokens ?? 0,
            durationMs
          );
        } else {
          // 若無法取得 Token 數量，僅記錄執行時間
          this.recordUsage(0, 0, durationMs);
        }
      }

      const content = response.content;
      if (typeof content === 'string') {
        return content;
      }
      return JSON.stringify(content);
    } catch (error) {
      this.logger.error(`LLM call failed after retries: ${error}`);
      throw error;
    }
  }

  // ==========================================
  // 基礎設施事件處理 (Event Subscription)
  // ==========================================

  private handleEvent(event: IEvent<string, DataBlock>): void {
    const dataBlock = event.payload;
    if (dataBlock) {
      // 安全校驗：非同一個 Session 的訊息應拒收
      if (dataBlock.sessionId !== this.sessionId) {
        this.logger.warn(`Ignored DataBlock ${dataBlock.id} from different session: ${dataBlock.sessionId}`);
        return;
      }

      this.inbox.push(dataBlock);
      this.logger.debug(`Received DataBlock in inbox. Queue length: ${this.inbox.length}`);
      
      // 自動喚醒
      if (this.state === AgentState.SUSPENDED || this.state === AgentState.IDLE) {
        this.resume().catch(err => {
          this.logger.error(`Failed to resume agent ${this.id}: ${err}`);
        });
      }
    }
  }

  // ==========================================
  // 資源消耗輔助 (Usage & Token Tracking)
  // ==========================================

  /**
   * 供子類別回報資源消耗量
   */
  public recordUsage(promptTokens: number, completionTokens: number, durationMs: number): void {
    this.usageStats.promptTokens += promptTokens;
    this.usageStats.completionTokens += completionTokens;
    this.usageStats.durationMs += durationMs;

    // 安全告警：檢查是否超過臨界值
    const MAX_SAFE_TOKENS = this.config.storage.max_safe_tokens ?? 100000;
    const totalTokens = this.usageStats.promptTokens + this.usageStats.completionTokens;
    if (totalTokens > MAX_SAFE_TOKENS) {
      this.logger.warn(`SECURITY WARNING: Token usage exceeded safe threshold (${totalTokens} > ${MAX_SAFE_TOKENS})`);
    }
  }

  // ==========================================
  // 狀態與生命週期管理
  // ==========================================

  protected setState(newState: AgentState): void {
    if (this.state === AgentState.TERMINATED) {
      this.logger.warn(`Attempted to change state of terminated agent ${this.id}`);
      return;
    }
    this.logger.debug(`State transition: ${this.state} -> ${newState}`);
    this.state = newState;
  }

  public getState(): AgentState {
    return this.state;
  }

  // ==========================================
  // 狀態持久化與存檔 (State Persistence)
  // ==========================================

  /**
   * 將當前狀態、消耗資訊與收件箱快照寫入實體磁碟
   */
  public saveState(): void {
    try {
      const stateData = {
        state: this.state,
        sessionId: this.sessionId,
        usageStats: this.usageStats,
        inbox: this.inbox.map(msg => ({
          id: msg.id,
          sessionId: msg.sessionId,
          threadId: msg.threadId,
          senderId: msg.senderId,
          targetId: msg.targetId,
          type: msg.type,
          timestamp: msg.timestamp,
          controlPayload: msg.controlPayload,
          dataPointers: msg.dataPointers
        })),
        timestamp: Date.now()
      };
      
      if (!fs.existsSync(this.oplogDir)) {
        fs.mkdirSync(this.oplogDir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(stateData, null, 2), 'utf-8');
      this.logger.debug(`State and inbox saved successfully to ${this.stateFilePath}`);
    } catch (err) {
      this.logger.error(`Failed to save state: ${err}`);
    }
  }

  /**
   * 從磁碟還原狀態、消耗資訊與收件箱快照
   */
  public loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf-8');
        const stateData = JSON.parse(data);
        this.state = stateData.state ?? AgentState.INITIALIZING;
        this.usageStats = stateData.usageStats ?? { promptTokens: 0, completionTokens: 0, durationMs: 0 };
        
        // 還原收件箱中的 DataBlock 物件
        if (stateData.inbox && Array.isArray(stateData.inbox)) {
          this.inbox = stateData.inbox.map((msg: any) => {
            const db = new DataBlock({
              sessionId: msg.sessionId,
              threadId: msg.threadId,
              senderId: msg.senderId,
              targetId: msg.targetId,
              type: msg.type,
              controlPayload: msg.controlPayload,
              dataPointers: msg.dataPointers
            });
            // 強制復原其原始生成的 UUID 與發送時間戳
            (db as any).id = msg.id;
            (db as any).timestamp = msg.timestamp;
            return db;
          });
        }
        
        this.logger.info(`State loaded successfully from disk. Pending inbox messages: ${this.inbox.length}`);
      }
    } catch (err) {
      this.logger.error(`Failed to load state: ${err}`);
    }
  }

  // ==========================================
  // 純粹的生命週期狀態控制方法
  // ==========================================

  /**
   * 主動掛起 (釋放 CPU 與 Token 消耗)
   * 進入 SUSPENDED 前會自動進行狀態存檔
   */
  public async suspend(): Promise<void> {
    this.setState(AgentState.SUSPENDED);
    this.saveState();
    this.logger.info(`Agent suspended. Waiting for events...`);
  }
  
  /**
   * 被動喚醒 (由 EventBus 呼叫)
   * 喚醒後切換至 BUSY，並處理收件箱中的訊息
   */
  public async resume(): Promise<void> {
    if (this.state !== AgentState.SUSPENDED && this.state !== AgentState.IDLE && this.state !== AgentState.INITIALIZING) {
      this.logger.warn(`Resume ignored. Current state is ${this.state}`);
      return;
    }
    
    this.setState(AgentState.BUSY);
    this.logger.info(`Agent resumed with ${this.inbox.length} messages.`);
    
    // 獲取當前信箱內容，隨後清空收件箱並交給子類別處理
    const messagesToProcess = [...this.inbox];
    this.inbox = [];
    
    try {
      await this.processInbox(messagesToProcess);
    } catch (err) {
      this.logger.error(`Failed to process inbox: ${err}`);
      throw err;
    }
  }

  /**
   * 觸發徹底銷毀的前置清理作業
   * 取消事件訂閱並釋放資源
   */
  public async destroy(): Promise<void> {
    this.logger.info(`Preparing for teardown (GC). Cleaning up resources...`);
    this.eventBus.unsubscribe(this.id, this.eventHandler);
    this.setState(AgentState.TERMINATED);
  }
}
