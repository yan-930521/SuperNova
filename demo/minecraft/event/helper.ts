import { DataBlock } from '../../../src/core/messaging/DataBlock';
import { EventBus } from '../../../src/core/messaging/EventBus';
import { AgentEvent } from '../../../src/core/messaging/IBus';

/**
 * 將感測器(環境/玩家)的事件包裝成 DataBlock 並透過 EventBus 發送給 Agent
 * @param eventBus 系統事件匯流排
 * @param sessionId 當前會話 ID
 * @param targetId 目標 Agent 的 ID (通常為 EmbodiedAgentId)
 * @param type 事件類型 (系統事件或人類發言)
 * @param controlPayload 事件詳細內容字串
 */
export function publishSensorEvent(
  eventBus: EventBus,
  sessionId: string,
  targetId: string,
  type: 'system' | 'human',
  controlPayload: string
) {
  const block = new DataBlock({
    sessionId,
    senderId: 'MinecraftEnv',
    targetId,
    type,
    intent: 'SENSOR_INPUT',
    controlPayload
  });
  eventBus.publish({ type: AgentEvent.AgentMessage, timestamp: Date.now(), sessionId, payload: block });
}
