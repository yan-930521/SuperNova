import { Config } from '../config/Config';
import { IDataBlockRepository } from '../domain/IRepository';
import { IEventBus } from '../domain/IBus';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentOptions, AgentType, BaseAgent, BaseAgentData } from './BaseAgent';
import { StateEntry, StateRegistry } from './StateRegistry';

export interface EmbodiedAgentData extends BaseAgentData {
    dynamicState?: Record<string, StateEntry>;
}

/**
 * EmbodiedAgent
 * 長期存在於特定環境（如虛擬世界或現實機器人）的具身智能實體。
 * 必須被強制注入 Body (形體) 組件。不可隨意分身。
 */
export class EmbodiedAgent extends BaseAgent {
  public readonly type = AgentType.EMBODIED;
  
  // 動態狀態樹，用於儲存感知與執行期記憶
  public readonly stateRegistry = new StateRegistry();

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

  public serialize(): EmbodiedAgentData {
      const baseData = super.serialize();
      return {
          ...baseData,
          dynamicState: this.stateRegistry.serialize()
      };
  }

  public hydrate(data: EmbodiedAgentData): void {
      super.hydrate(data);
      if (data.dynamicState) {
          this.stateRegistry.hydrate(data.dynamicState);
      }
  }
}
