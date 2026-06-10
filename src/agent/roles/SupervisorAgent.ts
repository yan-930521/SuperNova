import { HumanMessage, SystemMessage } from '@langchain/core/messages';
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
 * v0.5.0: 升級為混合雙擎，具備互動守門員能力。
 */
export class SupervisorAgent extends BaseAgent {
  /** 專業推理引擎緩存 (Fast Path) */
  private routerEngine: InferenceEngine;
  private shifterEngine: InferenceEngine;
  /** 角色身分定義 */
  private identityPrompt: string;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.identityPrompt = PromptLoader.load('prompts/identity/supervisor_agent.md');
    this.routerEngine = this.initEngine(ModelPreset.SMART, 'prompts/reasoning/sa_router.md');
    this.shifterEngine = this.initEngine(ModelPreset.SMART, 'prompts/reasoning/sa_gear_shifter.md');
    
    // 初始化 ReAct 執行器用於對話互動 (Conversational Path)
    this.buildExecutionEngine(ModelPreset.SMART);
  }

  protected setupSubscriptions(): void {
    // 1. 監聽全局分派指令 (對接用戶或外部系統)
    this.bus.subscribe(AgentEvents.Supervisor.Dispatch, this.onDispatch.bind(this));

    // 2. 監聽異常上報 (對接內部 Sub-Agent)
    this.bus.subscribe(AgentEvents.Flow.Escalate, this.onEscalate.bind(this));
  }

  /**
   * 處理全局分派：啟動對話式守門員機制 (Conversational Path)
   */
  private async onDispatch(event: AgentEvent): Promise<void> {
    const { sessionId, goal } = event.payload;
    // 錨定點：不再手動生成 traceId，交由 TaskService 在建立根任務時自動處理
    const traceId = event.payload.traceId;

    this.log(`[Supervisor] Handling dispatch request. Goal: ${goal}`, 'info', { traceId, sessionId });

    try {
      if (!this.reactAgent) {
        throw new Error("Supervisor ReAct Engine is not initialized.");
      }

      // 1. 準備系統提示詞 (包含 Identity 貫通與黑板上下文)
      const finalSystemPrompt = await this.getSystemPrompt(this.identityPrompt, event.payload);

      // 2. 準備輸入訊息
      const inputMsg = `User Goal: ${goal}`;

      this.updateHeartbeat(sessionId); // 使用 Session ID 作為心跳對象

      // 4. 透過 RunnableConfig 傳遞 context 給底層工具 (DispatchTaskTool 需要)
      const config = {
        configurable: {
          toolContext: {
            sessionId,
            traceId,
            agentId: this.id,
            metadata: { spanId: event.payload.spanId }
          }
        }
      };

      // 5. 執行 ReAct 迴圈：可能直接回答用戶，或呼叫 dispatch_task
      const result = await this.reactAgent.invoke({
        messages: [
          new SystemMessage(finalSystemPrompt),
          new HumanMessage(inputMsg)
        ]
      }, config);

      // 解析最後一個 AI 訊息作為結果 (如果是對話追問)
      const finalAnswer = result.messages[result.messages.length - 1].content;
      this.log(`[Supervisor] Interaction finished. Response: ${String(finalAnswer).substring(0, 100)}...`, 'info', { traceId, sessionId });

    } catch (error) {
      this.log(`[Supervisor] Dispatch processing failed: ${error}`, 'error', { traceId, sessionId });
      
      // 容錯機制：若 ReAct 失敗，嘗試降級為原有的快速路由 (Fast Path)
      this.log(`[Supervisor] Falling back to legacy fast-path routing...`, 'warn', { traceId, sessionId });
      await this.legacyFastPathRouting(event);
    }
  }

  /**
   * 舊有的快速路由邏輯 (作為降級備援)
   */
  private async legacyFastPathRouting(event: AgentEvent): Promise<void> {
    const { sessionId, goal, traceId } = event.payload;
    try {
      const decision = await this.routerEngine.infer({
        goal: goal || 'No goal',
        currentTask: "Initial Routing Decision",
        messages: [],
        metadata: { ...event.payload, traceId }
      }, RoutingDecisionSchema);

      this.bus.publish({
        type: AgentEvents.Flow.Initialize,
        timestamp: Date.now(),
        payload: {
          ...this.inheritPayload(event.payload, 'sa'),
          goal,
          templateType: decision.templateType,
          metadata: {
            routingRationale: decision.rationale,
            priority: decision.suggestedPriority
          }
        }
      });
    } catch (e) {
      this.log(`Fallback routing failed: ${e}`, 'error');
    }
  }

  /**
   * 處理換檔 (Dynamic Escalation)：分析異常原因並決定新的執行路徑 (Fast Path)
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
