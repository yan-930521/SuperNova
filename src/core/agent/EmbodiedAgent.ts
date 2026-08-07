import { Config } from '../config/Config';
import { IDataBlockRepository } from '../infra/persistence/IRepository';
import { IEventBus } from '../messaging/IBus';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentOptions, AgentType, BaseAgent } from './BaseAgent';

/**
 * EmbodiedAgent
 * 長期存在於特定環境（如虛擬世界或現實機器人）的具身智能實體。
 * 必須被強制注入 Body (形體) 組件。不可隨意分身。
 */
export class EmbodiedAgent extends BaseAgent {
  public readonly type = AgentType.EMBODIED;

  constructor(
    id: string,
    sessionId: string,
    options: AgentOptions
  ) {
    super(id, sessionId, options);
    
    // 從 JSON 設定檔載入 EmbodiedAgent 專屬身份與認知
    if (!this.profile) {
      try {
        const rawContent = PromptLoader.loadProfile('embodied_agent', this.config, '{}');
        const profileData = JSON.parse(rawContent);
        this.setProfile(profileData);
      } catch (error) {
        this.logger.error(`Failed to load embodied_agent.json: ${error}`);
      }
    }
  }
}
