import { Config } from '../config/Config';
import { IDataBlockRepository } from '../infra/persistence/IRepository';
import { IEventBus } from '../messaging/IBus';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentOptions, AgentState, AgentType, BaseAgent } from './BaseAgent';

/**
 * MainAgent
 * 系統的中樞大腦與全局管理者，負責高階邏輯路由與長期記憶。
 */
export class MainAgent extends BaseAgent {
  public readonly type = AgentType.MAIN;
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
    
    // 從 JSON 設定檔載入 MainAgent 專屬身份與認知
    if (!this.profile) {
      try {
        const rawContent = PromptLoader.loadProfile('v1/main_agent', this.config, '{}');
        const profileData = JSON.parse(rawContent);
        this.setProfile(profileData);
      } catch (error) {
        this.logger.error(`Failed to load main_agent.json: ${error}`);
      }
    }
  }

}
