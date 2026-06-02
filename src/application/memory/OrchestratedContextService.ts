import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { recorder } from '../../infra/LogManager';
import { IContextRepository } from '../../infra/persistence/IRepository';
import { IBlackboardState } from '../../infra/types/blackboard';

/**
 * OrchestratedContextService (協同上下文服務)
 * 負責管理任務鏈級別的黑板狀態 (Blackboard) 與上下文投影 (Briefing)。
 */
export class OrchestratedContextService implements ILifecycle {
  private cache = new Map<string, IBlackboardState>();

  constructor(
    private readonly contextRepo: IContextRepository<IBlackboardState>
  ) {}

  async initialize(): Promise<void> {
    recorder.info('[OrchestratedContextService] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[OrchestratedContextService] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    // 停止前保存所有緩存
    for (const [chainId, state] of this.cache.entries()) {
      await this.contextRepo.save(state);
    }
    this.cache.clear();
    recorder.info('[OrchestratedContextService] Stopped', { type: 'SYSTEM' });
  }

  /**
   * 獲取黑板狀態
   */
  public async getBlackboard(chainId: string): Promise<IBlackboardState> {
    if (this.cache.has(chainId)) {
      return this.cache.get(chainId)!;
    }

    const state = await this.contextRepo.load(chainId) || this.createInitialState(chainId);
    this.cache.set(chainId, state);
    return state;
  }

  /**
   * 追加事實 (Fact)
   */
  public async addFact(chainId: string, content: string): Promise<void> {
    const state = await this.getBlackboard(chainId);
    state.facts.push(content);
    state.timestamp = Date.now();
    await this.contextRepo.save(state);
  }

  /**
   * 追加假設 (Hypothesis)
   */
  public async addHypothesis(chainId: string, content: string): Promise<void> {
    const state = await this.getBlackboard(chainId);
    state.hypotheses.push(content);
    state.timestamp = Date.now();
    await this.contextRepo.save(state);
  }

  /**
   * 追加決策 (Decision)
   */
  public async addDecision(chainId: string, content: string, reasoning: string): Promise<void> {
    const state = await this.getBlackboard(chainId);
    state.decisions.push({ content, reasoning });
    state.timestamp = Date.now();
    await this.contextRepo.save(state);
  }

  /**
   * 追加未解問題 (Open Question)
   */
  public async addOpenQuestion(chainId: string, content: string): Promise<void> {
    const state = await this.getBlackboard(chainId);
    state.openQuestions.push(content);
    state.timestamp = Date.now();
    await this.contextRepo.save(state);
  }

  /**
   * 設置變數 (Variable)
   */
  public async setVariable(chainId: string, key: string, value: any): Promise<void> {
    const state = await this.getBlackboard(chainId);
    state.variables[key] = value;
    state.timestamp = Date.now();
    await this.contextRepo.save(state);
  }

  /**
   * 構建任務簡報 (Briefing) - 用於投影到 Agent Prompt
   */
  public async buildBriefing(chainId: string, goal: string): Promise<string> {
    const state = await this.getBlackboard(chainId);

    let briefing = `\n\n--- 協同上下文 (Orchestrated Context) ---`;
    briefing += `\n目標: ${goal}`;

    if (state.facts.length > 0) {
      briefing += `\n\n[Facts]:\n- ${state.facts.join('\n- ')}`;
    }

    if (state.decisions.length > 0) {
      briefing += `\n\n[Decisions]:\n- ${state.decisions.map(d => `${d.content} (理由: ${d.reasoning})`).join('\n- ')}`;
    }

    if (state.openQuestions.length > 0) {
      briefing += `\n\n[Open Questions]:\n- ${state.openQuestions.join('\n- ')}`;
    }

    const varKeys = Object.keys(state.variables);
    if (varKeys.length > 0) {
      briefing += `\n\n[Variables (漸進披露)]: ${varKeys.join(', ')}`;
      briefing += `\n(請使用 \`variable_access\` 獲取具體數值)`;
    }

    return briefing;
  }

  private createInitialState(chainId: string): IBlackboardState {
    return {
      id: chainId,
      facts: [],
      hypotheses: [],
      decisions: [],
      openQuestions: [],
      variables: {},
      timestamp: Date.now()
    };
  }
}
