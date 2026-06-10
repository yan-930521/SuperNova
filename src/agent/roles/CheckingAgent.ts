import { CheckSchema } from '../../schemas/agent/AgentOutputSchemas';
import { ContextService } from '../../application/context/ContextService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { BaseAgent } from '../BaseAgent';
import { PromptLoader } from '../../utils/PromptLoader';
import { IdGenerator } from '../../utils/IdGenerator';
import { InferenceEngine } from '../../infra/ModelRegistry';

/**
 * CheckingAgent (審核者) - SuperNova 0.4.0
 * 職責: 擔任 PDCA 循環中的「質量門禁」，嚴格驗證 DoingAgent 的產出是否符合 Planning 定義。
 * 特點: 支援引擎預熱，具備 PASS/FAIL/ESCALATE 三向裁決能力，並基於 L1 黑板實體數據說話。
 */
export class CheckingAgent extends BaseAgent {
  /** 審核推理引擎 */
  private checkingEngine: InferenceEngine;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.checkingEngine = this.initEngine(ModelPreset.EVAL, 'prompts/identity/checking_agent.md');
  }

  protected setupSubscriptions(): void {
    // 監聽質量檢核啟動事件
    this.bus.subscribe(AgentEvents.Checking.Start, this.onCheckStart.bind(this));
  }

  /**
   * 處理檢核啟動：對比黑板數據與成功標準
   */
  private async onCheckStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId } = event.payload;
    this.log(`QA Verification started for node: ${taskId}`, 'info', { traceId, sessionId });

    try {
      // 1 & 2. 準備系統提示詞 (包含 Identity 貫通與黑板上下文)
      const identityPrompt = PromptLoader.load('prompts/identity/checking_agent.md');
      const systemPrompt = await this.getSystemPrompt(identityPrompt, event.payload);

      // 3. 定義結構化審核 Schema (已移至 AgentOutputSchemas)

      // 4. 調用預熱引擎進行深度檢核
      const result = await this.checkingEngine.withSystemPrompt(systemPrompt).infer({
        goal: `Verify output of node ${taskId}`,
        currentTask: `Quality Assurance Gate`,
        messages: [{ role: 'user', content: `Please perform a technical audit on the results of task ${taskId} stored in the blackboard.` } as any],
        metadata: { traceId, sessionId, taskId }
      }, CheckSchema);

      this.log(`QA Decision for ${taskId}: ${result.decision}.`, 'info', { traceId, sessionId });

      // 5. 根據裁決結果發布流轉事件
      if (result.decision === 'PASS') {
        this.log(`Task ${taskId} PASSED. Proceeding to next phase.`, 'info', { traceId, sessionId });
        this.bus.publish({
          type: AgentEvents.Checking.Pass,
          timestamp: Date.now(),
          payload: { 
            ...this.inheritPayload(event.payload, 'ca'),
            taskId, 
            reason: result.rationale
          }
        });
      } 
      else if (result.decision === 'FAIL') {
        this.log(`Task ${taskId} FAILED. Returning to Doing phase for fix.`, 'warn', { traceId, sessionId });
        this.bus.publish({
          type: AgentEvents.Checking.Fail,
          timestamp: Date.now(),
          payload: { 
            ...this.inheritPayload(event.payload, 'ca'),
            taskId, 
            error: result.rationale,
            content: result.improvement_suggestions // 提供給 DA 的修正建議
          }
        });
      } 
      else {
        // ESCALATE: 偵測到邏輯死胡同（例如環境不支援或需求衝突），上報 SA
        this.log(`Task ${taskId} requested ESCALATION. Routing to Supervisor...`, 'error', { traceId, sessionId });
        this.bus.publish({
          type: AgentEvents.Flow.Escalate,
          timestamp: Date.now(),
          payload: { 
            ...this.inheritPayload(event.payload, 'ca'),
            taskId, 
            reason: `QA_BLOCKER: ${result.rationale}`,
            metadata: { findings: result.findings }
          }
        });
      }

    } catch (error) {
      this.log(`QA Process failed: ${error}`, 'error', { traceId, sessionId });
      
      // 系統錯誤亦視為檢核失敗，觸發自癒
      this.bus.publish({
        type: AgentEvents.Checking.Fail,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'ca'),
          taskId, 
          error: `QA_SYSTEM_ERROR: ${String(error)}`
        }
      });
    }
  }
}
