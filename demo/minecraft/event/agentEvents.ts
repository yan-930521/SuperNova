import { Bot } from 'mineflayer';
import { EventBus } from '../../../src/core/messaging/EventBus';
import { AgentEvent, IEvent } from '../../../src/core/messaging/IBus';

/**
 * 監聽 EventBus 上的 Agent 訊息，轉換為 Mineflayer 的動作 (例如：講話)
 */
export function setupAgentEvents(bot: Bot, eventBus: EventBus, embodiedAgentId: string) {
  eventBus.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
    const dataBlock = event.payload;
    // 只攔截從大腦(embodiedAgentId)發出的命令
    if (dataBlock && dataBlock.senderId === embodiedAgentId) {
      console.log(`\n[Agent ${embodiedAgentId}]: ${dataBlock.controlPayload}`);
      // 最簡單的實作：直接將 Agent 的回覆轉換為在遊戲裡講話
      bot.chat(dataBlock.controlPayload);
    }
  });
}
