import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import {
    Commands, Events, IAgentExecuteContext, ICommand, ICommandBus, IEventBus
} from '../../core/messaging/IBus';
import { Task } from '../../domain/task/Task';
import { recorder } from '../../infra/LogManager';
import { ITaskRepository } from '../../infra/persistence/IRepository';
import { TaskStatus } from '../../infra/types/task';
import { IExecuteTaskPayload } from '../task/TaskScheduler';
import { AgentService } from './AgentService';

/**
 * AgentExecutorService (代理執行服務)
 * 作為指令橋接器，負責接收執行請求，調度具體的 Agent 實例進行任務執行。
 * 它橋接了新架構的 Command/Event 系統與現有的 Agent 推理邏輯。
 */
export class AgentExecutorService implements ILifecycle {
  constructor(
    private readonly commandBus: ICommandBus,
    private readonly eventBus: IEventBus,
    private readonly taskRepo: ITaskRepository<Task>,
    private readonly agentService: AgentService
  ) { }

  /**
   * 生命週期：初始化，註冊執行指令處理器
   */
  async initialize(): Promise<void> {
    this.commandBus.registerHandler(Commands.Task.Execute, this.handleExecuteTask.bind(this));
    recorder.info('[AgentExecutorService] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[AgentExecutorService] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    recorder.info('[AgentExecutorService] Stopped', { type: 'SYSTEM' });
  }

  /**
   * 處理執行指令
   */
  private async handleExecuteTask(command: ICommand<Commands.Task.Execute>): Promise<any> {
    const { taskId, chainId, sessionId } = (command as any).payload as IExecuteTaskPayload;

    recorder.info(`[AgentExecutorService] Executing Task: ${taskId}`, {
      type: 'SYSTEM',
      session_id: sessionId
    });

    // 1. 載入任務實體
    const task = await this.taskRepo.load(taskId);
    if (!task) {
      throw new Error(`[AgentExecutorService] Task ${taskId} not found in repository.`);
    }

    // 更新狀態為執行中
    task.updateStatus(TaskStatus.RUNNING);
    await this.taskRepo.save(task);

    try {
      // 2. 取得執行代理
      let agentId = task.assignedAgentId || 'researcher-01';
      let agent = this.agentService.getAgent(agentId);

      // --- 增加：採集前置任務結果 (上下文繼承) ---
      const dependencyResults: Record<string, string> = {};
      if (task.dependencies && task.dependencies.length > 0) {
        recorder.debug(`[AgentExecutorService] Collecting dependencies for task ${taskId}: ${task.dependencies.join(', ')}`, { type: 'SYSTEM' });
        for (const depId of task.dependencies) {
          const depTask = await this.taskRepo.load(depId);
          if (depTask && depTask.status === TaskStatus.COMPLETED) {
            // 取得摘要，如果沒有則使用最後一條訊息內容
            const summary = depTask.metadata.lastSummary as string ||
              depTask.history[depTask.history.length - 1]?.identity.name + ": Done";
            dependencyResults[depId] = summary;
          }
        }
      }

      // 增加 Fallback 邏輯：防止 LLM 幻覺產出不存在的 Agent ID
      if (!agent) {
        recorder.warn(`[AgentExecutorService] Assigned agent ${agentId} not found for task ${taskId}. Falling back to researcher-01.`, { type: 'SYSTEM' });
        agentId = 'researcher-01';
        agent = this.agentService.getAgent(agentId);
      }

      if (!agent) {
        throw new Error(`[AgentExecutorService] No valid agent (including fallback) found for task ${taskId}.`);
      }

      // 3. 準備執行上下文 (IAgentExecuteContext)
      const context: IAgentExecuteContext = {
        sessionId,
        chainId,
        taskId,
        traceId: `exec-${Date.now()}-${taskId.substring(0, 8)}`,
        agentId,
        dependencyResults,
        retryCount: task.retryCount,
        lastError: task.metadata.lastError as string | undefined
      };

      // 4. 真正發動 Agent 執行 (呼叫現有的 BaseAgent.execute)
      recorder.info(`[AgentExecutorService] Agent ${agentId} is taking task: ${task.goal}`, { type: 'SYSTEM' });
      console.log(task)
      const result = await agent.execute(task.goal, context);

      // 5. 實體吸收執行軌跡 (Thought/Tool history)
      task.absorbExecuteResult(result);
      await this.taskRepo.save(task);

      // 6. 根據結果發布事件
      if (result.status === 'success') {
        recorder.info(`[AgentExecutorService] Task completed successfully: ${taskId}`, { type: 'SYSTEM' });
        this.eventBus.publish({
          type: Events.Task.Finished,
          timestamp: Date.now(),
          payload: {
            taskId,
            chainId,
            sessionId,
            agentId,
            summary: result.summary,
            result: result.result.content
          }
        });
      } else {
        recorder.error(`[AgentExecutorService] Task failed: ${taskId}. Error: ${result.error}`, { type: 'SYSTEM' });
        this.eventBus.publish({
          type: Events.Task.Failed,
          timestamp: Date.now(),
          payload: {
            taskId,
            chainId,
            sessionId,
            error: result.error
          }
        });
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      recorder.error(`[AgentExecutorService] Fatal execution error for task ${taskId}: ${errorMsg}`, { type: 'SYSTEM' });

      this.eventBus.publish({
        type: Events.Task.Failed,
        timestamp: Date.now(),
        payload: { taskId, chainId, sessionId, error: errorMsg }
      });

      throw error;
    }
  }
}
