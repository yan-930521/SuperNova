import { z } from 'zod';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { ContextService } from '../../application/context/ContextService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { InferenceEngine } from '../../infra/ModelRegistry';
import { ModelPreset } from '../../infra/types/agent';
import { CheckSchema } from '../../schemas/agent/AgentOutputSchemas';
import { IdGenerator } from '../../utils/IdGenerator';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseAgent } from '../BaseAgent';

/**
 * CheckingAgent (審核者) - SuperNova 0.6.0
 * 職責: 擔任 PDCA 循環中的「質量門禁」。
 * 升級: 現在使用 ReAct 機制進行自主驗證，隨後將結果收斂至結構化模板。
 */
export class CheckingAgent extends BaseAgent {
  /** 審核推理引擎 (用於最後的結構化收斂) */
  private identityPrompt: string;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.identityPrompt = PromptLoader.load('prompts/identity/checking_agent.md');
    
    // 初始化 ReAct 執行器，用於深度的工具輔助驗證
    this.buildExecutionEngine(ModelPreset.SMART, CheckSchema);
  }

  protected setupSubscriptions(): void {
    // 監聽質量檢核啟動事件
    this.bus.subscribe(AgentEvents.Phase.Start, (e) => {
      if (e.payload.phase === 'CHECKING') {
        this.onStart(e);
      }
    });
  }

  /**
   * 處理檢核啟動：使用 ReAct 進行深度審核
   */
  private async onStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId } = event.payload;
    
    this.log(`QA Verification (ReAct Mode) started for node: ${taskId}`, 'info', { traceId, sessionId });

    try {
      if (!this.reactAgent) {
        throw new Error("ReAct Engine is not initialized.");
      }

      // 1. 準備系統提示詞
      const finalSystemPrompt = await this.getSystemPrompt(this.identityPrompt, event.payload);

      // 2. 準備給 LLM 的驗證指令
      const auditMsg = `
Please perform a technical audit on the results of task ${taskId}.
You should use your tools to inspect the blackboard (L1), file system, or any other resources to verify the output.
Your final goal is to decide if this task:
1. PASSES (meets all requirements)
2. FAILS (needs minor fixes)
3. Needs ESCALATION (blocked or severe issues)
`;

      this.updateHeartbeat(taskId!);

      // 3. 執行 ReAct 迴圈進行自主驗證
      const config = {
        configurable: {
          toolContext: {
            sessionId,
            traceId,
            agentId: this.id,
            metadata: { taskId }
          }
        }
      };

      const result: z.infer<typeof CheckSchema> = await this.reactAgent.invoke({
        messages: [
          new SystemMessage(finalSystemPrompt),
          new HumanMessage(auditMsg)
        ]
      }, config).then(r => r.structuredResponse);

      this.log(`QA Decision for ${taskId}: ${result.decision}.`, 'info', { traceId, sessionId });

      // 5. 根據裁決結果發布流轉事件
      if (result.decision === 'PASS') {
        this.bus.publish({
          type: AgentEvents.Phase.Finish,
          timestamp: Date.now(),
          payload: {
            ...this.inheritPayload(event.payload, 'ca'),
            taskId,
            phase: 'CHECKING',
            result: 'success',
            reason: result.rationale
          }
        });
      }
      else if (result.decision === 'FAIL') {
        this.bus.publish({
          type: AgentEvents.Phase.Finish,
          timestamp: Date.now(),
          payload: {
            ...this.inheritPayload(event.payload, 'ca'),
            taskId,
            phase: 'CHECKING',
            result: 'fail',
            error: result.rationale,
            content: result.improvement_suggestions
          }
        });
      }
      else {
        // ESCALATE
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

      this.bus.publish({
        type: AgentEvents.Phase.Fail,
        timestamp: Date.now(),
        payload: {
          ...this.inheritPayload(event.payload, 'ca'),
          taskId,
          phase: 'CHECKING',
          error: `QA_SYSTEM_ERROR: ${String(error)}`
        }
      });
    }
  }
}
