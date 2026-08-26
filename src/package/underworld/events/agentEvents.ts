import { MobController } from '../../novalink/novalink-sdk';
import { messaging } from '../../../core';
import { IEventBus } from '../../../core/domain/IBus';

export function setupAgentEvents(mobController: MobController, eventBus: IEventBus, embodiedAgentId: string, sessionId: string) {

    eventBus.subscribe(messaging.AgentEvent.AgentMessage, async (event: messaging.IEvent<messaging.AgentEvent.AgentMessage>) => {
        const payload = event.payload as any;
        const blocks = Array.isArray(payload) ? payload : [payload];
        for (const dataBlock of blocks) {
            // 如果是 EmbodiedAgent 發出的純文字訊息，才廣播到 Minecraft 聊天頻道
            if (dataBlock && dataBlock.senderId === embodiedAgentId) {
                const content = dataBlock.controlPayload;
                if (typeof content === 'string' && content.trim() !== '') {
                    mobController.say(content);
                }
            }
        }
    });

    eventBus.subscribe(messaging.HookEvent.BeforeAgentStep, async (event: messaging.IEvent<messaging.HookEvent.BeforeAgentStep>) => {
        if (event.payload.agentId !== embodiedAgentId) return;
        
        if (!event.payload.injectedPrompts) event.payload.injectedPrompts = [];
        event.payload.injectedPrompts.push({
            index: messaging.PromptSectionIndex.ENVIRONMENT_STATE,
            content: `You are the Embodied Right Brain in Minecraft. You will receive commands from the MainAgent or act upon your own reflexes.`
        });
    });
}
