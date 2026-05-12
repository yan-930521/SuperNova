import type { IAgent } from '../../interfaces/agent/IAgent';
import type { IMutationRequest } from '../../interfaces/models/IMutationRequest';
import { PromptLoader } from '../utils/PromptLoader';

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
    console.log(`[BaseAgent ${this.id}] Receiving task: ${JSON.stringify(task)}`);
  }

  /**
   * 提議規則變更 (目前僅記錄日誌)
   * @param mutation 變更請求
   */
  async proposeMutation(mutation: IMutationRequest): Promise<void> {
    console.log(`[BaseAgent ${this.id}] Proposing mutation to ${mutation.target_hook}`);
  }
}
