import { BaseAgent } from './BaseAgent';
import { IEvaluatorAgent } from '../../interfaces/agent/IEvaluatorAgent';
import { IEvaluationRecord } from '../../interfaces/agent/IAgentState';
import { IModelRegistry, IInferenceEngine, ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { ThoughtEvalResponseSchema, PlanReviewSchema } from '../schemas/agent/AgentOutputSchemas';

/**
 * EvaluatorAgent 類
 * 負責根據外部 Prompt 模板對思維或規劃進行評審。
 * 配置應包含 prompts.thought_eval 和 prompts.plan_review 連結。
 */
export class EvaluatorAgent extends BaseAgent implements IEvaluatorAgent {
  private thoughtEvalEngine: IInferenceEngine;
  private planReviewEngine: IInferenceEngine;

  constructor(private modelRegistry: IModelRegistry) {
    super();
    const evalModel = this.modelRegistry.getModel(ModelPreset.EVAL);
    
    // 預先綁定常見評估引擎
    this.thoughtEvalEngine = evalModel.withSystemPrompt(
      this._config.prompts?.thought_eval || "Evaluate these thoughts: {items}"
    );
    this.planReviewEngine = evalModel.withSystemPrompt(
      this._config.prompts?.plan_review || "Review this plan: {items}"
    );
  }

  /**
   * 初始化後重新綁定提示詞 (僅在第一次初始化時執行)
   */
  async initFromJSON(config: Record<string, any>): Promise<void> {
    const isFirstInit = !this._isReady;

    if (!isFirstInit) {
      if (config.prompts?.identity && config.prompts.identity !== this.identity) {
        console.warn(`[EvaluatorAgent ${this.id}] Attempted to change identity after initialization. Agent is immutable. Change ignored.`);
        const safeConfig = { 
          ...config, 
          prompts: { ...config.prompts, identity: this.identity } 
        };
        await super.initFromJSON(safeConfig);
      } else {
        await super.initFromJSON(config);
      }
      console.log(`[EvaluatorAgent ${this.id}] 狀態已恢復，跳過引擎重新綁定。`);
      return;
    }

    await super.initFromJSON(config);
    const evalModel = this.modelRegistry.getModel(ModelPreset.EVAL);
    
    this.thoughtEvalEngine = evalModel.withSystemPrompt(
      this._config.prompts?.thought_eval || "Evaluate these thoughts: {items}"
    );
    this.planReviewEngine = evalModel.withSystemPrompt(
      this._config.prompts?.plan_review || "Review this plan: {items}"
    );

    this._isReady = true;
    
    console.log(`[EvaluatorAgent ${this.id}] 初始化完成。Evaluation Engines Ready.`);
  }
  
  /**
   * 對一組對象進行批次評分
   */
  async evaluateBatch(targets: any[], criteria: any): Promise<IEvaluationRecord[]> {
    console.log(`[EvaluatorAgent ${this.id}] 開始對 ${targets.length} 個項目進行評估。`);

    const isThought = criteria.type === 'thought';
    const engine = isThought ? this.thoughtEvalEngine : this.planReviewEngine;
    const schema = isThought ? ThoughtEvalResponseSchema : PlanReviewSchema;

    // 2. 執行真實推理 (Stateless)
    const result = await engine.infer(
      criteria.state || { goal: criteria.goal, messages: criteria.messages || [], metadata: { identity: this.identity } },
      schema as any,
      {
        variables: {
          items: targets,
          goal: criteria.goal
        }
      }
    );

    // 3. 結構轉換
    if (isThought) {
      return (result as any[]).map(r => ({
        ...r,
        evaluatorId: this.id
      }));
    } else {
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
   * 實作 IWorkerAgent 要求的 processTask
   * @param taskNode 來自 TaskGraph 的任務節點
   */
  async processTask(taskNode: any): Promise<any> {
    // 評估者主要執行評估工作。
    // taskNode 可能包含評估標準與目標。
    if (taskNode.type === 'evaluate_thought' || taskNode.type === 'evaluate_plan') {
      const { targets, criteria } = taskNode.data || {};
      if (!targets || !criteria) {
        throw new Error(`評估任務 ${taskNode.id} 缺少目標或標準。`);
      }
      const evalCriteria = { ...criteria, type: taskNode.type.split('_')[1] };
      return this.evaluateBatch(targets, evalCriteria);
    }
    
    throw new Error(`EvaluatorAgent 無法處理任務類型: ${taskNode.type}`);
  }
}
