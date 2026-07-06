import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { SessionService } from '../../application/session/SessionService';
import { TaskService } from '../../application/task/TaskService';
import {
    AgentEvent, AgentEvents, IAgentEventPayload, IEventBus, SystemEvents
} from '../../core/messaging/IBus';
import { Task } from '../../domain/task/Task';
import { InferenceEngine } from '../../infra/ModelRegistry';
import { ModelPreset } from '../../infra/types/agent';
import { MessageRole } from '../../infra/types/session';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import {
    EscalationDecisionSchema, RoutingDecisionSchema
} from '../../schemas/agent/SupervisingSchemas';
import { IdGenerator } from '../../utils/IdGenerator';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseAgent } from '../BaseAgent';

/**
 * SupervisorAgent (模組化推理編排器)
 * SuperNova 0.5.0 核心中樞
 * 職責: 監聽事件並調用專業推理引擎（路由、換檔）進行精確決策。
 * v0.5.0: 升級為混合雙擎，具備互動守門員能力，並全面接管任務流轉決策權。
 */
export class SupervisorAgent extends BaseAgent {
  /** 專業推理引擎緩存 (Fast Path) */
  private routerEngine: InferenceEngine;
  private shifterEngine: InferenceEngine;
  /** 角色身分定義 */
  private identityPrompt: string;
  private taskService: TaskService;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.identityPrompt = PromptLoader.load('prompts/identity/supervisor_agent.md');
    this.routerEngine = this.initEngine(ModelPreset.SMART, 'prompts/reasoning/sa_router.md');
    this.shifterEngine = this.initEngine(ModelPreset.SMART, 'prompts/reasoning/sa_gear_shifter.md');
    
    const container = GlobalRuntime.getInstance().container;
    this.taskService = container.resolve<TaskService>('TaskService');

    // 初始化 ReAct 執行器用於對話互動 (Conversational Path)
    this.buildExecutionEngine(ModelPreset.SMART);
  }

  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Control.Halt, (e) => {});
    this.bus.subscribe(AgentEvents.Control.Dispatch, (e) => this.onDispatch(e));

    this.bus.subscribe(AgentEvents.Flow.Initialize, (e) => this.onFlowInitialize(e));
    this.bus.subscribe(AgentEvents.Flow.Transition, (e) => {});
    this.bus.subscribe(AgentEvents.Flow.Escalate, (e) => this.onEscalate(e));

    this.bus.subscribe(AgentEvents.Phase.Start, (e) => {});
    this.bus.subscribe(AgentEvents.Phase.Finish, (e) => this.onPhaseFinish(e));
    this.bus.subscribe(AgentEvents.Phase.Fail, (e) => this.onPhaseFail(e));

    // 移除舊有的 onTick 調度邏輯，改由 TaskService 統一驅動
  }

  /**
   * 處理直接分派請求：使用路由專家進行快速判斷 (Fast Path)
   */
  private async onDispatch(event: AgentEvent): Promise<void> {
    const { sessionId, traceId: payloadTraceId, content } = event.payload;
    const traceId = payloadTraceId || IdGenerator.trace();

    this.log(`[Supervisor] Fast-track dispatching: ${content}`, 'info', { traceId, sessionId });

    try {
      // 調用專業路由引擎進行結構化推理
      const decision = await this.routerEngine.infer({
        goal: content || 'No goal',
        currentTask: "Initial Routing Decision",
        messages: [],
        metadata: { ...event.payload, traceId }
      }, RoutingDecisionSchema);

      this.log(`[Supervisor] Routing decision: ${decision.templateType}. Rationale: ${decision.rationale}`, 'info', { traceId, sessionId });

      // 建立任務 (狀態為 pending，待 TaskService 調度)
      const task = await this.taskService.createTask({
        sessionId,
        goal: content || '',
        description: content || '',
        templateType: decision.templateType,
        traceId
      });

      this.log(`[Supervisor] Root task ${task.id} created and queued. Template: ${decision.templateType}`, 'info', { traceId, sessionId });

    } catch (error) {
      this.log(`[Supervisor] Fast-track routing failed: ${error}`, 'error', { traceId, sessionId });
    }
  }

  /**
   * 處理任務初始化 (通常用於子任務或換檔後的重啟)
   */
  private async onFlowInitialize(event: AgentEvent): Promise<void> {
    const { sessionId, templateType, content } = event.payload;
    const traceId = event.payload.traceId || IdGenerator.trace();

    try {
      const task = await this.taskService.createTask({
        sessionId,
        goal: content || '',
        description: content || '',
        templateType: templateType || 'Standard',
        traceId,
        parentTaskId: event.payload.metadata?.parentTaskId
      });

      this.log(`[Supervisor] Task ${task.id} initialized and queued.`, 'info', { traceId, sessionId });
    } catch (error) {
      this.log(`[Supervisor] Flow initialization failed: ${error}`, 'error', { traceId, sessionId });
    }
  }

  /**
   * 監聽階段完成事件，推進狀態機
   */
  private async onPhaseFinish(event: AgentEvent): Promise<void> {
    const { taskId, sessionId, traceId, result, metadata } = event.payload;
    if (!taskId) return;

    try {
      // 1. 如果是 PLANNING 階段完成，且帶有子圖數據，則注入任務實體
      if (event.payload.phase === 'PLANNING' && metadata?.subGraph) {
        const task = await this.taskService.getTask(taskId);
        if (task) {
          this.log(`[Supervisor] Injecting subGraph into task ${taskId}`, 'info', { traceId, sessionId });
          task.setSubGraph(metadata.subGraph);
          // 重新註冊以水合子任務到 TaskService 的 L1 快取
          this.taskService.registerTask(task);
          await this.taskService.updateTask(task);
        }
      }

      // 2. 推進狀態機。注意：TaskService 的 Tick 會在下一個循環啟動 newPhase
      const newPhase = await this.taskService.transitionTask(taskId, result || 'success');
      
      this.log(`[Supervisor] Phase finished for task ${taskId}. Result: ${result || 'success'}. Next: ${newPhase}`, 'info', { traceId, sessionId });

      if (newPhase === 'FINISH') {
        // 任務完成處理
        const task = await this.taskService.getTask(taskId);
        if (task) {
          task.updateStatus('completed');
          await this.taskService.updateTask(task);
        }
        this.log(`[Supervisor] Task ${taskId} completed successfully.`, 'info', { traceId, sessionId });

        // 發布任務完成事件
        this.bus.publish({
          type: SystemEvents.Task.Finished,
          timestamp: Date.now(),
          payload: {
            ...this.inheritPayload(event.payload, 'sa'),
            taskId,
            content: `Task ${taskId} completed successfully.`
          }
        });
      }
    } catch (error) {
      this.log(`[Supervisor] Phase transition failed: ${error}`, 'error', { traceId, sessionId });
    }
  }

  /**
   * 監聽階段失敗事件
   */
  private async onPhaseFail(event: AgentEvent): Promise<void> {
    const { taskId, sessionId, traceId, error } = event.payload;
    if (!taskId) return;

    this.log(`[Supervisor] Phase failed for task ${taskId}. Error: ${error}`, 'error', { traceId, sessionId });
    
    // 自動觸發 Escalate 進行換檔推理
    this.bus.publish({
      type: AgentEvents.Flow.Escalate,
      timestamp: Date.now(),
      payload: {
        ...this.inheritPayload(event.payload, 'sa'),
        taskId,
        reason: error || 'Phase execution failed',
        content: `Task failed at phase ${event.payload.phase}`
      }
    });
  }

  /**
   * 處理換檔 (Dynamic Escalation)：分析異常原因並決定新的執行路徑 (Fast Path)
   */
  private async onEscalate(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId, reason, content } = event.payload;
    
    this.log(`[Supervisor] Escalation requested by task ${taskId}. Reason: ${reason}`, 'warn', {
      traceId,
      sessionId
    });

    try {
      // 1. 調用預熱好的換檔專家引擎進行二次裁決
      // 該推理模組專門負責分析 Scope Creep 或 Timeout，並產出恢復策略。
      const decision = await this.shifterEngine.infer({
        goal: content || "Restore system operation",
        currentTask: "Dynamic Gear Shifting Decision",
        messages: [],
        metadata: { ...event.payload }
      }, EscalationDecisionSchema);

      this.log(`[Supervisor] Shift decision: ${decision.action}. Reasoning: ${decision.reasoning}`, 'info', { traceId, sessionId });

      // 2. 執行換檔動作：切換模板 (shift) 或發起緊急修復 (emergency_fix)
      if (decision.action === 'shift' && decision.newTemplateType) {
        // 發布新的初始化訊號，變更任務模板（換檔）
        this.bus.publish({
          type: AgentEvents.Flow.Initialize,
          timestamp: Date.now(),
          payload: {
            ...this.inheritPayload(event.payload, 'sa'),
            templateType: decision.newTemplateType,
            metadata: {
              ...event.payload.metadata,
              shiftReasoning: decision.reasoning,
              instructions: decision.recoveryInstructions
            }
          }
        });
      } else if (decision.action === 'emergency_fix') {
        // 遇到崩潰或嚴重錯誤，切換至 Emergency (reAct 直修) 模式
        this.bus.publish({
          type: AgentEvents.Flow.Initialize,
          timestamp: Date.now(),
          payload: {
            ...this.inheritPayload(event.payload, 'sa'),
            templateType: 'Emergency',
            metadata: {
              ...event.payload.metadata,
              shiftReasoning: decision.reasoning
            }
          }
        });
      } else {
        // TODO: 處理 retry (原地重試) 或 abort (終止) 的自動化流程對接
        this.log(`[Supervisor] Action ${decision.action} is not yet fully automated.`, 'warn', { traceId, sessionId });
      }

    } catch (error) {
      this.log(`[Supervisor] Escalation decision failed: ${error}`, 'error', { traceId, sessionId });
    }
  }
}
