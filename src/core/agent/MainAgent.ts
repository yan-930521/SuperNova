import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DataBlock } from '../messaging/DataBlock';
import { AgentType, BaseAgent } from './BaseAgent';

/**
 * MainAgent
 * 系統的中樞大腦與全局管理者，負責高階邏輯路由與長期記憶。
 * 不具備形體 (Body)，且不可被分身複製 (Singleton per session)。
 */
export class MainAgent extends BaseAgent {
  public readonly type = AgentType.MAIN;
  public readonly canClone = false;

  protected getModel(): BaseChatModel {
    // TODO: 回傳適合 MainAgent 複雜推理能力的大型語言模型實例
    throw new Error('Method not implemented.');
  }

  protected async processInbox(messages: DataBlock<any>[]): Promise<void> {
    this.logger.info(`MainAgent processing ${messages.length} messages.`);
    // TODO: 實作 MainAgent 的全局任務分派與 Deep Merge 邏輯
  }
}
