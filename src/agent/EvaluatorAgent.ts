import { BaseAgent } from './BaseAgent';
import { IEvaluatorAgent } from '../../interfaces/agent/IEvaluatorAgent';
import { IEvaluationRecord } from '../../interfaces/agent/IAgentState';
import { IModelRegistry, IInferenceEngine, ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { ThoughtEvalResponseSchema, PlanReviewSchema } from '../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../utils/PromptLoader';

/**
 * EvaluatorAgent 類
 * 負責根據外部 Prompt 模板對思維或規劃進行評審。
 * 配置應包含 prompts.thought_eval 和 prompts.plan_review 連結。
 */
export class EvaluatorAgent extends BaseAgent implements IEvaluatorAgent {
  private evalInference: IInferenceEngine;

  constructor(private modelRegistry: IModelRegistry) {
    super();
    this.evalInference = this.modelRegistry.getModel(ModelPreset.EVAL);
  }
  
  /**
   * 對一組對象進行批次評分
   * @param targets 待評分對象列表 (如 ThoughtNodes 或 TaskNodes)
   * @param criteria 評分上下文 (包含 type, goal, messages, state 等)
   */
  async evaluateBatch(targets: any[], criteria: any): Promise<IEvaluationRecord[]> {
    console.log(`[EvaluatorAgent ${this.id}] Starting real evaluation for ${targets.length} items.`);

    // 1. 決定任務類型對應的模板與 Schema
    const isThought = criteria.type === 'thought';
    const promptTemplate = isThought 
      ? this._config.prompts?.thought_eval 
      : this._config.prompts?.plan_review;
    
    const schema = isThought ? ThoughtEvalResponseSchema : PlanReviewSchema;

    // 2. 執行真實推理 (利用 LangGraph 內部風格：原始模板 + state 注入)
    // 注意：如果是規劃審查，模型通常回傳單個結果；如果是思維評價，回傳數組。
    // 為了統一接口，我們在此處進行適配。
    const result = await this.evalInference.infer(
      promptTemplate || "Evaluate the following items: {items}",
      criteria.state || { goal: criteria.goal, messages: criteria.messages || [], metadata: { identity: this.identity } },
      schema as any,
      {
        variables: {
          items: targets,
          goal: criteria.goal
        }
      }
    );

    // 3. 結構轉換：確保回傳符合 IEvaluationRecord[]
    if (isThought) {
      // ThoughtEvalResponseSchema 本身就是數組
      return (result as any[]).map(r => ({
        ...r,
        evaluatorId: this.id
      }));
    } else {
      // PlanReviewSchema 是單個物件，我們將其擴展到所有 targets (通常規劃審核是對整個圖的)
      const review = result as { score: number; rationale: string };
      return [{
        targetId: 'current_plan',
        score: review.score,
        rationale: review.rationale,
        evaluatorId: this.id
      }];
    }
  }

  /**
   * 實作 IWorkerAgent 要求的 executeIntent
   */
  async executeIntent(intent: any): Promise<any> {
    if (intent.type === 'evaluate') {
      return this.evaluateBatch(intent.targets, intent.criteria);
    }
    return null;
  }
}
