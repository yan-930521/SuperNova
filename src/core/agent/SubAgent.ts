import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DataBlock } from '../messaging/DataBlock';
import { AgentType, BaseAgent } from './BaseAgent';

/**
 * SubAgent
 * 為解決特定任務動態生成的邏輯控制單元 (PDCA 協調者)。
 * 可在突發高負載下支援分身併發 (canClone = true)。
 */
export class SubAgent extends BaseAgent {
  public readonly type = AgentType.SUB;
  public readonly canClone = true;

  protected getModel(): BaseChatModel {
    // TODO: 回傳適合 SubAgent 的快速推理語言模型實例
    throw new Error('Method not implemented.');
  }

  protected async processInbox(messages: DataBlock<any>[]): Promise<void> {
    this.logger.info(`SubAgent processing ${messages.length} messages.`);
    // TODO: 實作 SubAgent 的 PDCA (Plan-Do-Check-Act) 循環邏輯
  }
}
