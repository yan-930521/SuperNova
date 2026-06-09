import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { ReflectionSchema } from '../../schemas/agent/AgentOutputSchemas';
import { ContextService } from '../../application/context/ContextService';
import { BaseAgent } from '../BaseAgent';
import { MemoryService } from '../../application/memory/MemoryService';
import { PromptLoader } from '../../utils/PromptLoader';
import { IdGenerator } from '../../utils/IdGenerator';
import { InferenceEngine } from '../../infra/ModelRegistry';

/**
 * ActingAgent (改善者) - SuperNova 0.4.0
 * 職責: 總結 PDCA 循環、標準化 SOP 並沈澱知識。
 * 特點: 擔任「知識管理員」，負責將 Session 級別的發現升遷至 Global 級別，實現系統級進化。
 */
export class ActingAgent extends BaseAgent {
  /** 改善推理引擎 */
  private actingEngine: InferenceEngine;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.actingEngine = this.initEngine(ModelPreset.SMART, 'prompts/identity/acting_agent.md');
  }

  protected setupSubscriptions(): void {
    // 監聽改進啟動事件 (PDCA 最後一環)
    this.bus.subscribe(AgentEvents.Acting.Start, this.onActStart.bind(this));
  }

  /**
   * 處理改進啟動：執行事實提取與 SOP 沉澱
   */
  private async onActStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId } = event.payload;
    this.log(`Knowledge distillation started for node: ${taskId}`, 'info', { traceId, sessionId });

    try {
      const contextService = this.runtime.container.resolve<ContextService>('ContextService');
      const memoryService = this.runtime.container.resolve<MemoryService>('MemoryService');

      // 1. 渲染改善指令 (自動加載執行軌跡與黑板數據)
      const systemPrompt = contextService.renderPrompt('ActingAgent', event.payload, []);

      // 2. 定義結構化沈澱 Schema (已移至 AgentOutputSchemas)
      
      // 3. 調用預熱引擎進行知識提煉
      const result = await this.actingEngine.withSystemPrompt(systemPrompt).infer({
        goal: "Distill knowledge and standardize process",
        currentTask: `PDCA Refinement`,
        messages: [{ role: 'user', content: `Please review the execution trace of task ${taskId} and finalize the cognitive assets.` } as any],
        metadata: { traceId, sessionId, taskId }
      }, ReflectionSchema);

      this.log(`Reflection completed. Distilled ${result.facts.length} facts.`, 'info', { traceId, sessionId });

      // 4. 執行事實升遷 (L2 Promotion)
      // 理由：根據 Agent 的判定，將有價值的數據存入對應的作用域 (Session 或 Global)
      for (const fact of result.facts) {
        const targetScope = fact.is_global ? 'global' : sessionId;
        await memoryService.saveL2Memory(targetScope, {
          id: IdGenerator.fact(fact.is_global ? 'global' : 'session'),
          sessionId: targetScope,
          layer: 'L2',
          authorId: this.id,
          timestamp: Date.now(),
          data: {
            topic: fact.topic,
            content: fact.content,
            confidence: 1.0,
            sourceTaskId: taskId
          }
        });
      }

      // 5. SOP 標準化與持久化 (L3)
      if (result.sop_content) {
        const sopId = IdGenerator.sop();
        await memoryService.saveL3Memory('global', {
          id: sopId,
          sessionId: 'global',
          layer: 'L3',
          authorId: this.id,
          timestamp: Date.now(),
          data: {
            title: `Standard Operating Procedure from Task ${taskId}`,
            steps: [result.sop_content],
            conditions: []
          }
        });
        this.log(`New SOP persisted: ${sopId}`, 'info', { traceId, sessionId });
      }

      // 6. 發布任務終結訊號
      this.bus.publish({
        type: AgentEvents.Acting.Finish,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'aa'),
          taskId, 
          content: result.improvement_briefing || 'Reflection complete. Assets Distilled.'
        }
      });

    } catch (error) {
      this.log(`Distillation process failed: ${error}`, 'error', { traceId, sessionId });
      
      // 即使改善失敗，也應發布結案訊號，避免流程掛起
      this.bus.publish({
        type: AgentEvents.Acting.Fail,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'aa'),
          taskId, 
          error: String(error)
        }
      });
    }
  }
}

