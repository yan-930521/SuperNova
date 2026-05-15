import type { IAgent } from '../../interfaces/agent/IAgent';
import type { IAgentComponent } from '../../interfaces/agent/IAgentComponent';
import type { IMutationRequest } from '../../interfaces/models/IMutationRequest';
import { PromptLoader } from '../utils/PromptLoader';
import { logger } from '../infra/LogManager';

/**
 * BaseAgent 類
 * 實作 IAgent 接口，提供基礎的識別、序列化與日誌功能。
 */
export class BaseAgent implements IAgent {
  protected _id: string = '';
  protected _role: string = '';
  protected _identity: string = '';
  protected _capabilities: string[] = [];
  protected _config: Record<string, any> = {};
  protected _isReady: boolean = false;
  private _components = new Map<string, IAgentComponent>();

  get id(): string {
    return this._id;
  }

  get role(): string {
    return this._role;
  }

  get identity(): string {
    return this._identity;
  }

  get capabilities(): string[] {
    return this._capabilities;
  }

  /**
   * 檢查 Agent 是否已完成初始化且準備好執行任務
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * 獲取指定名稱的組件
   * @param name 組件名稱
   * @throws 如果組件不存在則拋出錯誤
   */
  getComponent<T extends IAgentComponent>(name: string): T {
    const component = this._components.get(name);
    if (!component) {
      throw new Error(`Component ${name} not found on Agent ${this.id}`);
    }
    return component as T;
  }

  /**
   * 添加組件到 Agent
   * @param component 組件實例
   */
  addComponent(component: IAgentComponent): void {
    this._components.set(component.name, component);
  }

  /**
   * 從 JSON 配置初始化或恢復 Agent 狀態
   * @param config 配置對象
   */
  async initFromJSON(config: Record<string, any>): Promise<void> {
    // 預處理：解析長文本連結
    const resolvedConfig = await PromptLoader.resolvePrompts(config);
    
    const { id, role, capabilities, type, prompts, ...rest } = resolvedConfig;
    this._id = id || this._id;
    this._role = role || this._role;
    this._identity = prompts?.identity || this._identity;
    this._capabilities = capabilities || this._capabilities;
    this._config = {
      ...this._config,
      ...rest,
      prompts: prompts || this._config.prompts,
      type: type || this._config.type
    };
  }

  /**
   * 將 Agent 當前狀態序列化為 JSON
   */
  toJSON(): Record<string, any> {
    return {
      id: this._id,
      role: this._role,
      capabilities: this._capabilities,
      prompts: {
        identity: this._identity
      },
      ...this._config,
    };
  }

  /**
   * 接收並處理任務 (目前僅記錄日誌)
   * @param task 任務數據
   */
  async receiveTask(task: any): Promise<void> {
    logger.info(`[BaseAgent ${this.id}] Receiving task: ${JSON.stringify(task)}`, { agent_id: this.id, type: 'SYSTEM' });
  }

  /**
   * 提議規則變更 (目前僅記錄日誌)
   * @param mutation 變更請求
   */
  async proposeMutation(mutation: IMutationRequest): Promise<void> {
    logger.info(`[BaseAgent ${this.id}] Proposing mutation to ${mutation.target_hook}`, { agent_id: this.id, type: 'SYSTEM' });
  }
}
