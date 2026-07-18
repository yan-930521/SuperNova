import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DataBlock } from '../messaging/DataBlock';
import { AgentType, BaseAgent } from './BaseAgent';

/**
 * EmbodiedAgent
 * 長期存在於特定環境（如虛擬世界或現實機器人）的具身智能實體。
 * 必須被強制注入 Body (形體) 組件。不可隨意分身。
 */
export class EmbodiedAgent extends BaseAgent {
  public readonly type = AgentType.EMBODIED;
  public readonly canClone = false;

  protected getModel(): BaseChatModel {
    // TODO: 回傳適合處理感測器資料與多模態的語言模型實例
    throw new Error('Method not implemented.');
  }

  protected async processInbox(messages: DataBlock<any>[]): Promise<void> {
    this.logger.info(`EmbodiedAgent processing ${messages.length} messages.`);
    // TODO: 實作與環境互動、ActionTools 調用等邏輯
  }
}
