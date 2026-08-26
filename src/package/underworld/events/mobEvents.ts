import { messaging } from '../../../core';
import { IEventBus } from '../../../core/domain/IBus';
import { RpcClient } from '../../novalink/novalink-sdk';
import { publishSensorEvent } from './helper';

export function setupMobEvents(rpcClient: RpcClient, eventBus: IEventBus, sessionId: string, embodiedAgentId: string, mainAgentId: string) {
    rpcClient.onEvent('chat', (params: any) => {
        const { sender, message } = params;
        console.log(`[NovaLink] Chat [${sender}]: ${message}`);
        
        const block = new messaging.DataBlock({
            sessionId,
            senderId: sender,
            targetId: embodiedAgentId,
            type: 'human',
            intent: 'SENSOR_INPUT',
            priority: messaging.MessagePriority.LOW,
            controlPayload: message
        });
        eventBus.publish({ type: messaging.AgentEvent.AgentMessage, timestamp: Date.now(), sessionId, payload: block });
    });

    rpcClient.onEvent('entity_hurt', (params: any) => {
        const { uuid, damage, health } = params;
        
        publishSensorEvent(
            eventBus, sessionId, embodiedAgentId, 'system',
            `[身體警報: 受擊]\n你受到了傷害！失去 ${damage.toFixed(1)} 點血量。(剩餘血量: ${health.toFixed(1)})`,
            'URGENT_ALERT',
            messaging.MessagePriority.URGENT
        );
        publishSensorEvent(
            eventBus, sessionId, mainAgentId, 'system',
            `[身體警報: 受擊]\n你受到了傷害！失去 ${damage.toFixed(1)} 點血量。(剩餘血量: ${health.toFixed(1)})`,
            'URGENT_ALERT',
            messaging.MessagePriority.URGENT
        );
    });

    rpcClient.onEvent('entity_death', (params: any) => {
        const { uuid, x, y, z } = params;
        const coords = `x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}`;
        publishSensorEvent(
            eventBus, sessionId, embodiedAgentId, 'system',
            `[身體警報: 死亡]\n你已經死亡！\n- 死前座標: ${coords}`,
            'URGENT_ALERT',
            messaging.MessagePriority.URGENT
        );
        publishSensorEvent(
            eventBus, sessionId, mainAgentId, 'system',
            `[身體警報: 死亡]\n你已經死亡！\n- 死前座標: ${coords}`,
            'URGENT_ALERT',
            messaging.MessagePriority.URGENT
        );
        eventBus.publish({
            type: messaging.AgentEvent.EmotionTriggered,
            timestamp: Date.now(),
            sessionId: sessionId,
            payload: { impacts: { distress: 80, fear: 50, anxiety: 50 } }
        });
    });
}
