import { messaging } from '../../../core';
import { IEventBus } from '../../../core/domain/IBus';

/**
 * 輔助函數：發布 Sensor 變動事件
 */
export function publishSensorEvent(
    eventBus: IEventBus,
    sessionId: string,
    targetId: string,
    type: 'system' | 'human',
    controlPayload: string,
    intent: string = 'SENSOR_INPUT',
    priority: messaging.MessagePriority = messaging.MessagePriority.LOW
) {
    const block = new messaging.DataBlock({
        sessionId,
        senderId: 'MinecraftEnv',
        targetId,
        type,
        intent,
        priority,
        controlPayload
    });
    eventBus.publish({ type: messaging.AgentEvent.AgentMessage, timestamp: Date.now(), sessionId, payload: block });
}
