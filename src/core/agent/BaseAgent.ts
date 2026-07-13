import * as path from 'path';

import { Config } from '../../config/Config';
import { LogManager } from '../infra/LogManager';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { DataBlock } from '../messaging/DataBlock';
import { IEventBus } from '../messaging/IBus';

/**
 * Agent 的 PDCA 與生命週期狀態
 */
export enum AgentState {
  /** 初始化中 */
  INITIALIZING = 'INITIALIZING',
  /** 閒置中，可接受新任務 (或準備進入 Lazy GC) */
  IDLE = 'IDLE',
  /** [P] 規劃階段：建立 TaskDAG */
  PLAN = 'PLAN',
  /** [D] 執行階段：派遣 Worker，隨後應進入掛起 */
  DO = 'DO',
  /** 掛起中：不消耗 Token，等待 EventBus 喚醒 */
  SUSPENDED = 'SUSPENDED',
  /** [C] 檢視階段：收到 DataBlock 後驗證結果 */
  CHECK = 'CHECK',
  /** [A] 決策修正階段：修補計畫或處理錯誤 */
  ACT = 'ACT',
  /** 已銷毀 */
  TERMINATED = 'TERMINATED'
}

/**
 * 所有 Agent 的抽象基底類別 (BaseAgent)
 * 嚴格定義了上下文綁定日誌 (Contextual Logger) 與 PDCA 狀態機的切換。
 */
export abstract class BaseAgent {
  /** 當前生命週期狀態 */
  protected state: AgentState;
  /** 上下文綁定的專屬 Logger (不會污染全局) */
  protected readonly logger: LogManager;

  constructor(
    public readonly id: string,
    protected readonly eventBus: IEventBus,
    protected readonly config: Config
  ) {
    this.state = AgentState.INITIALIZING;
    
    // 注入專屬的 Contextual Logger，追蹤這個 Agent 的所有行為
    this.logger = new LogManager({ agent_id: this.id, type: 'AGENT' });
    // 安裝 Console 傳輸器
    this.logger.addTransport(new ConsoleTransport('DEBUG'));
    
    // 根據 ID 與 Config 自動索引並掛載實體的 Oplog 檔案傳輸器
    const oplogDir = path.join(
      process.cwd(), 
      this.config.storage.base_dir, 
      this.config.storage.agent_dir, 
      this.id
    );
    this.logger.addTransport(new FileTransport('DEBUG', oplogDir, '.oplog.jsonl'));
    
    this.logger.info(`[BaseAgent] Initializing agent: ${this.id}`);
  }

  // ==========================================
  // PDCA 循環抽象方法 (由子類別如 SubAgent 實作)
  // ==========================================

  /** [P] 制定或更新計畫 */
  protected abstract plan(taskContext: any): Promise<void>;
  
  /** [D] 執行派發並掛起 */
  protected abstract do(): Promise<void>;
  
  /** [C] 喚醒後檢視收集到的成果或錯誤 */
  protected abstract check(dataBlocks: DataBlock[]): Promise<void>;
  
  /** [A] 決策：進入下一輪 PDCA 還是完結任務 */
  protected abstract act(): Promise<void>;

  // ==========================================
  // 狀態與生命週期管理
  // ==========================================

  /**
   * 變更狀態並記錄軌跡
   */
  protected setState(newState: AgentState): void {
    if (this.state === AgentState.TERMINATED) {
      this.logger.warn(`[BaseAgent] Attempted to change state of terminated agent ${this.id}`);
      return;
    }
    this.logger.debug(`[BaseAgent] State transition: ${this.state} -> ${newState}`);
    this.state = newState;
  }

  public getState(): AgentState {
    return this.state;
  }

  /**
   * 主動掛起 (釋放 CPU 與 Token 消耗)
   * 將進入 SUSPENDED 狀態等待 EventBus 喚醒
   */
  public async suspend(): Promise<void> {
    this.setState(AgentState.SUSPENDED);
    this.logger.info(`[BaseAgent] Agent suspended. Waiting for events...`);
    // 實際的掛起邏輯會與 InboxBuffer 配合
  }
  
  /**
   * 被動喚醒 (由 InboxBuffer 或 EventBus 呼叫)
   * 喚醒後強制進入 CHECK 階段檢視結果
   */
  public async resume(dataBlocks: DataBlock[]): Promise<void> {
    if (this.state !== AgentState.SUSPENDED && this.state !== AgentState.IDLE) {
      this.logger.warn(`[BaseAgent] Resume ignored. Current state is ${this.state}`);
      return;
    }
    this.logger.info(`[BaseAgent] Resumed with ${dataBlocks.length} incoming DataBlocks.`);
    this.setState(AgentState.CHECK);
    await this.check(dataBlocks);
  }

  /**
   * 觸發 Lazy GC 或徹底銷毀的前置清理作業
   * 確保解除掛載的 Workspace 與 Oplog
   */
  public async destroy(): Promise<void> {
    this.logger.info(`[BaseAgent] Preparing for teardown (GC). Cleaning up resources...`);
    this.setState(AgentState.TERMINATED);
    // 未來在此處實作 WorkspaceManager.destroyWorkspace() 呼叫
  }
}
