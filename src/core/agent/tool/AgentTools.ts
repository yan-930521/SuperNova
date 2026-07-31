import { z } from 'zod';

import { DataBlock, MessagePriority } from '../../messaging/DataBlock';
import { AgentEvent, IEventBus } from '../../messaging/IBus';
import { BaseTool, ToolContext } from './BaseTool';

export class SendMessageTool extends BaseTool {
    public readonly name = 'send_message';
    public readonly description = 'Send a message to another Agent in the system. Can be used for chatting, giving orders, or delegating tasks.';
    public readonly schema = z.object({
        targetId: z.string().describe('The exact ID of the target agent (e.g., minecraft-bot-01).'),
        message: z.string().describe('The message content, instruction, or task description to send.'),
    });

    public async execute(args: { targetId: string; message: string }, context: ToolContext): Promise<string> {
        const block = new DataBlock({
            sessionId: context.sessionId,
            senderId: context.agentId,
            targetId: args.targetId,
            type: 'ai',
            intent: 'AGENT_REPLY',
            controlPayload: args.message
        });

        await context.eventBus.publishAsync({
            type: AgentEvent.AgentMessage,
            timestamp: Date.now(),
            sessionId: context.sessionId,
            payload: block
        });

        return `Message successfully dispatched to ${args.targetId}. Waiting for their response...`;
    }
}

export class ToggleProjectionTool extends BaseTool {
    public readonly name = 'toggle_projection';
    public readonly description = 'Project your consciousness into a target agent, taking direct control over its senses and actions, or release control. Use this when you need to directly interface with an environment through a specific body.';
    public readonly schema = z.object({
        targetId: z.string().describe('The ID of the target agent to project into (e.g., minecraft-bot-01).'),
        enable: z.boolean().describe('True to start projection and take control, False to release control and restore its autonomy.'),
    });

    public async execute(args: { targetId: string; enable: boolean }, context: ToolContext): Promise<string> {
        context.eventBus.publish({
            type: AgentEvent.ProjectionToggled,
            timestamp: Date.now(),
            sessionId: context.sessionId,
            payload: {
                targetAgentId: args.targetId,
                controllerId: context.agentId,
                enable: args.enable
            }
        });

        if (args.enable) {
            // 發送超高優先度的系統訊息給軀殼，強制喚醒
            const block = new DataBlock({
                sessionId: context.sessionId,
                senderId: 'SYSTEM',
                targetId: args.targetId,
                type: 'system',
                intent: 'URGENT_ALERT',
                priority: MessagePriority.URGENT,
                controlPayload: `[系統通知] 意識投影連結已建立！大腦 (${context.agentId}) 的靈魂已經進入你的軀殼。請立刻以大腦的人設與思維開始接管行動！`
            });
            await context.eventBus.publishAsync({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId: context.sessionId,
                payload: block
            });
            return `Consciousness successfully projected into ${args.targetId}. You are now receiving its sensory inputs directly.`;
        } else {
            // 發送超高優先度的系統訊息給軀殼，告知斷線
            const block = new DataBlock({
                sessionId: context.sessionId,
                senderId: 'SYSTEM',
                targetId: args.targetId,
                type: 'system',
                intent: 'URGENT_ALERT',
                priority: 100,
                controlPayload: `[系統通知] 意識投影連結已中斷！靈魂已拔除，你已恢復自主軀殼狀態。`
            });
            await context.eventBus.publishAsync({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId: context.sessionId,
                payload: block
            });
            return `Projection ended. Autonomy restored to ${args.targetId}. Memory synchronized back to your brain.`;
        }
    }
}
