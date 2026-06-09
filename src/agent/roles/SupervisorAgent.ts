import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { EscalationDecisionSchema, RoutingDecisionSchema } from '../../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseAgent } from '../BaseAgent';
import { IdGenerator } from '../../utils/IdGenerator';
import { InferenceEngine } from '../../infra/ModelRegistry';

/**
 * SupervisorAgent (模組化推理編排器)
 * SuperNova 0.4.0 核心中樞
 * 職責: 監聽事件並調用專業推理引擎（路由、換檔）進行精確決策。
 */
export class SupervisorAgent extends BaseAgent {
  /** 專業推理引擎緩存 */
  private routerEngine: InferenceEngine;
  private shifterEngine: InferenceEngine;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.routerEngine = this.initEngine(ModelPreset.SMART, 'prompts/reasoning/sa_router.md');
    this.shifterEngine = this.initEngine(ModelPreset.SMART, 'prompts/reasoning/sa_gear_shifter.md');
  }

  protected setupSubscriptions(): void {
    // 1. 監聽全局分派指令
    this.bus.subscribe(AgentEvents.Supervisor.Dispatch, this.onDispatch.bind(this));

    // 2. 監聽異常上報
    this.bus.subscribe(AgentEvents.Flow.Escalate, this.onEscalate.bind(this));
  }

  /**
   * 處理全局分派：啟動「路由專家」推理任務進行初始模板判定
   */
  private async onDispatch(event: AgentEvent): Promise<void> {
    const { sessionId, goal } = event.payload;
    const traceId = event.payload.traceId || IdGenerator.trace();

    this.log(`[Supervisor] Dispatching goal: ${goal}`, 'info', { traceId, sessionId });

    try {
      // 1. 調用預熱好的專業路由引擎進行結構化推理
      // 理由：直接使用緩存的 routerEngine 可避免重複載入 Prompt 檔案與初始化推理鏈，大幅提升反應速度。
      const decision = await this.routerEngine.infer({
        goal,
        currentTask: "Initial Routing Decision",
        metadata: { ...event.payload, traceId }
      }, RoutingDecisionSchema);

      this.log(`[Supervisor] Routing decision: ${decision.templateType}. Rationale: ${decision.rationale}`, 'info', { traceId, sessionId });

      // 2. 根據推理結果正式發布任務初始化訊號 (Flow.Initialize)
      // 這將觸發 TaskService 建立任務實體並掛載對應的 TaskFlow 狀態機。
      this.bus.publish({
        type: AgentEvents.Flow.Initialize,
        timestamp: Date.now(),
        payload: {
          sessionId,
          traceId,
          goal,
          templateType: decision.templateType,
          spanId: IdGenerator.span('sa'),
          parentSpanId: event.payload.spanId,
          metadata: {
            routingRationale: decision.rationale,
            priority: decision.suggestedPriority
          }
        }
      });

    } catch (error) {
      this.log(`[Supervisor] Routing failed: ${error}`, 'error', { traceId, sessionId });
      
      // 3. 容錯機制：若路由推理失敗，預設降級為 Standard (完整 PDCA) 流程，確保系統不中斷
      this.bus.publish({
        type: AgentEvents.Flow.Initialize,
        timestamp: Date.now(),
        payload: { 
          sessionId, 
          traceId, 
          goal, 
          templateType: 'Standard', 
          spanId: IdGenerator.span('sa') 
        }
      });
    }
  }

  /**
   * 處理換檔 (Dynamic Escalation)：分析異常原因並決定新的執行路徑
   */
  private async onEscalate(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId, reason } = event.payload;
    
    this.log(`[Supervisor] Escalation requested by task ${taskId}. Reason: ${reason}`, 'warn', {
      traceId,
      sessionId
    });

    try {
      // 1. 調用預熱好的換檔專家引擎進行二次裁決
      // 該推理模組專門負責分析 Scope Creep 或 Timeout，並產出恢復策略。
      const decision = await this.shifterEngine.infer({
        goal: event.payload.goal || "Restore system operation",
        currentTask: "Dynamic Gear Shifting Decision",
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
            ...event.payload,
            templateType: decision.newTemplateType,
            spanId: IdGenerator.span('sa'),
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
            ...event.payload,
            templateType: 'Emergency',
            spanId: IdGenerator.span('sa'),
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
