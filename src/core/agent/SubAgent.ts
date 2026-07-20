import { Config } from '../config/Config';
import { IDataBlockRepository } from '../infra/persistence/IRepository';
import { IEventBus } from '../messaging/IBus';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentType, BaseAgent, AgentOptions } from './BaseAgent';

/**
 * SubAgent
 * 為解決特定任務動態生成的邏輯控制單元 (PDCA 協調者)。
 */
export class SubAgent extends BaseAgent {
  public readonly type = AgentType.SUB;
  public readonly canClone = true;

  constructor(
    id: string,
    sessionId: string,
    eventBus: IEventBus,
    config: Config,
    dataBlockRepo: IDataBlockRepository,
    options?: AgentOptions
  ) {
    super(id, sessionId, eventBus, config, dataBlockRepo, options);
    
    // 如果沒有被指派 profile (例如是 Clone)，則載入預設的
    if (!this.profile) {
      try {
        const rawContent = PromptLoader.loadProfile('v1/sub_agent', this.config, '{}');
        const profileData = JSON.parse(rawContent);
        this.setProfile(profileData);
      } catch (error) {
        this.logger.error(`Failed to load sub_agent.json: ${error}`);
      }
    }
  }
}
