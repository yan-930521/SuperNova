import { BaseAgent } from '../../core/agent/BaseAgent';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * SubAgent (暫時型 / 無形體)
 * 為了解決特定任務而動態生成的邏輯控制單元，擔任 PDCA 循環的執行者。
 */
export class SubAgent extends BaseAgent {
  protected getModel(): BaseChatModel {
    return {} as any; // 測試與初期 Stub，不實際調用 LLM
  }

  protected async processInbox(messages: any[]): Promise<void> {
    this.logger.info(`SubAgent ${this.id} processInbox triggered with ${messages.length} messages.`);
  }
}
