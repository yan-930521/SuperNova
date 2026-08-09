import { z } from 'zod';

import { AgentType } from '../agent/BaseAgent';
import { AgentEvent, SystemEvent } from '../domain/IBus';
import { ITaskManager } from '../domain/ITask';
import { WorkspaceType } from '../domain/IWorkspaceManager';
import { DataBlock, MessagePriority } from '../messaging/DataBlock';
import { IdGenerator } from '../utils/IdGenerator';
import { BaseTool, ToolContext } from './BaseTool';

import type { AgentManager } from '../agent/AgentManager';
export class SendMessageTool extends BaseTool {
    public readonly name = 'send_message';
    public readonly description = 'Send a message to another Agent in the system. Can be used for chatting, giving orders, or delegating tasks.';
    public readonly schema = z.object({
        targetId: z.string().describe('The exact ID of the target agent (e.g., minecraft-bot-01).'),
        message: z.string().describe('The message content, instruction, or task description to send.'),
    });

    public async execute(args: { targetId: string; message: string }, context: ToolContext): Promise<string> {
        const messageBlock = new DataBlock({
            sessionId: context.sessionId,
            senderId: context.agentId,
            targetId: args.targetId,
            type: 'ai',
            intent: 'AGENT_REPLY',
            controlPayload: args.message
        });

        const reminderBlock = new DataBlock({
            sessionId: context.sessionId,
            senderId: 'SYSTEM',
            targetId: args.targetId,
            type: 'system',
            intent: 'SYSTEM_REMINDER',
            controlPayload: `Please use the \`send_message\` tool to reply to ${context.agentId}. Do NOT output your reply as plain text.`
        });

        await context.eventBus.publishAsync({
            type: AgentEvent.AgentMessage,
            timestamp: Date.now(),
            sessionId: context.sessionId,
            payload: [messageBlock, reminderBlock]
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
                controlPayload: `[系統通知] 意識投影連結已建立！大腦 (${context.agentId}) 的靈魂已經進入你的軀殼。請立刻以大腦的人設與思維開始接管行動！`,
                metadata: {
                    senderName: 'System'
                }
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
                priority: MessagePriority.URGENT,
                controlPayload: `[系統通知] 意識投影連結已中斷！靈魂已拔除，你已恢復自主軀殼狀態。`,
                metadata: {
                    senderName: 'System'
                }
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

export class SpawnAgentTool extends BaseTool {
    public readonly name = 'spawn_agent';
    public readonly description = 'Spawn a new sub-agent to delegate tasks to.';
    public get schema() {
        const availableTools = this.agentManager.getAllAvailableToolNames().join(', ');
        return z.object({
            objective: z.string().describe('The initial objective for this agent.'),
            allowedTools: z.array(z.string()).describe(`The list of tools this agent is allowed to use. Available tools: ${availableTools}`),
            workspaceType: z.enum(['PERSISTENT', 'VOLATILE']).describe('Workspace isolation level. PERSISTENT shares the main workspace, VOLATILE uses a temporary one.'),
            isTemp: z.boolean().describe('If true, this agent will be terminated by the system when all its assigned tasks are completed. If false, it stays alive.')
        });
    }

    constructor(
        private readonly agentManager: AgentManager
    ) {
        super();
    }

    public async execute(args: {
        objective: string;
        allowedTools: string[];
        workspaceType: WorkspaceType;
        isTemp: boolean;
    }, context: ToolContext): Promise<string> {

        const agentId = IdGenerator.agent('sub');

        await this.agentManager.spawnAgent(
            AgentType.TASK,
            agentId,
            context.sessionId,
            {
                workspaceType: args.workspaceType,
                allowedTools: args.allowedTools,
                isTemp: args.isTemp
            }
        );

        const block = new DataBlock({
            sessionId: context.sessionId,
            senderId: context.agentId,
            targetId: agentId,
            type: 'system',
            intent: 'TASK_ASSIGNMENT',
            priority: MessagePriority.HIGH,
            controlPayload: `[TASK ASSIGNMENT] Your objective is:\n${args.objective}\n\nPlease start execution. When you finish, report back.`,
            metadata: {
                senderName: 'System'
            }
        });
        await context.eventBus.publishAsync({
            type: AgentEvent.AgentMessage,
            timestamp: Date.now(),
            sessionId: context.sessionId,
            payload: block
        });

        return `Agent ${agentId} spawned successfully and objective assigned. Use send_message to communicate further, or assign_task to bind it to a DAG task.`;
    }
}

export class AssignTaskTool extends BaseTool {
    public readonly name = 'assign_task';
    public readonly description = 'Assign a specific task from the DAG to an existing agent. The system will automatically notify the agent and track its progress.';
    public readonly schema = z.object({
        taskId: z.string().describe('The ID of the task to assign.'),
        agentId: z.string().describe('The ID of the agent to assign the task to.')
    });

    constructor(
        private readonly taskManager: ITaskManager,
        private readonly agentManager: AgentManager
    ) {
        super();
    }

    public async execute(args: { taskId: string, agentId: string }, context: ToolContext): Promise<string> {
        try {
            const agent = this.agentManager.getAgent(args.agentId);
            if (!agent) {
                return `Error: Agent ${args.agentId} not found.`;
            }

            if (agent.assignedTaskId) {
                return `Error: Agent ${args.agentId} is already assigned to task ${agent.assignedTaskId}.`;
            }

            this.taskManager.assignTask(context.sessionId, args.taskId, args.agentId);
            agent.assignedTaskId = args.taskId;
            
            return `Task ${args.taskId} successfully assigned to agent ${args.agentId}.`;
        } catch (e: any) {
            return `Failed to assign task: ${e.message}`;
        }
    }
}

export class UpdateTaskStatusTool extends BaseTool {
    public readonly name = 'update_task_status';
    public readonly description = 'Report the result of your currently assigned task and update its status. Use this when you have completed a task or encountered an unrecoverable error.';
    public readonly schema = z.object({
        status: z.enum(['COMPLETED', 'FAILED']).describe('The final status of the task.'),
        result_or_reason: z.string().describe('A summary of what you accomplished (if completed) or a detailed explanation of why it failed (if failed).')
    });

    constructor(
        private readonly agentManager: AgentManager,
        private readonly taskManager: ITaskManager
    ) {
        super();
    }

    public async execute(args: { status: 'COMPLETED' | 'FAILED', result_or_reason: string }, context: ToolContext): Promise<string> {
        const agent = this.agentManager.getAgent(context.agentId);
        if (!agent?.assignedTaskId) {
            return 'Error: You do not have an assigned task to update.';
        }

        const taskId = agent.assignedTaskId;
        const task = this.taskManager.getTask(context.sessionId, taskId);
        const targetId = task?.creatorId || null;

        if (args.status === 'COMPLETED') {
            context.eventBus.publish({
                type: SystemEvent.TaskFinished,
                timestamp: Date.now(),
                sessionId: context.sessionId,
                payload: { taskId, result: args.result_or_reason }
            });

            const block = new DataBlock({
                sessionId: context.sessionId,
                senderId: context.agentId,
                targetId: targetId,
                type: 'system',
                intent: 'TASK_COMPLETION_REPORT',
                priority: MessagePriority.NORMAL,
                controlPayload: `[Task Completion Report] Task ${taskId} completed.\nResult: ${args.result_or_reason}`,
                metadata: {
                    senderName: 'System'
                }
            });
            context.eventBus.publish({ type: AgentEvent.AgentMessage, timestamp: Date.now(), sessionId: context.sessionId, payload: block });
        } else {
            context.eventBus.publish({
                type: SystemEvent.TaskFailed,
                timestamp: Date.now(),
                sessionId: context.sessionId,
                payload: { taskId, error: args.result_or_reason }
            });

            const block = new DataBlock({
                sessionId: context.sessionId,
                senderId: context.agentId,
                targetId: targetId,
                type: 'system',
                intent: 'TASK_FAILED_REPORT',
                priority: MessagePriority.URGENT,
                controlPayload: `[Task Failed Report] Task ${taskId} failed.\nReason: ${args.result_or_reason}\nNote: Downstream dependent tasks have been canceled.`,
                metadata: {
                    senderName: 'System'
                }
            });
            context.eventBus.publish({ type: AgentEvent.AgentMessage, timestamp: Date.now(), sessionId: context.sessionId, payload: block });
        }

        agent.assignedTaskId = undefined;

        // Auto-termination logic: check if there are any downstream tasks assigned to this agent that are still PENDING or READY
        const allTasks = this.taskManager.getAllTasks(context.sessionId);
        const hasMoreTasks = allTasks.some(t => t.assignedAgentId === context.agentId && (t.status === 'PENDING' || t.status === 'READY'));

        if (!hasMoreTasks && agent.isTemporary) {
            await this.agentManager.terminateAgent(context.agentId);
            return `Task ${taskId} marked as ${args.status}. No further tasks assigned. Termination sequence initiated. Goodbye.`;
        }

        return `Task ${taskId} marked as ${args.status}. Notification sent. Please wait for your manager or the system to assign your next task.`;
    }
}
