import { messaging } from '../../../core';

export function publishSensorEvent(
    eventBus: messaging.EventBus,
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
