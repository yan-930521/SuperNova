import { IAgentState } from './IAgentState';

/**
 * 思維節點接口
 */
export interface IThoughtNode {
  id: string;
  content: string;
  parentId: string | null;
  score: number;
  rationale?: string;
  depth: number;
  status: 'pending' | 'active' | 'abandoned';
  metadata?: Record<string, any>;
}

/**
 * 思維引擎接口
 * 整合了 LangGraph 節點行為邏輯
 */
export interface IThoughtEngine {
  /**
   * [Node] 生成思維分支並更新 State
   */
  generateCandidates(state: IAgentState): Promise<Partial<IAgentState>>;

  /**
   * [Node] 評價思維分支並更新 State
   */
  evaluateCandidates(state: IAgentState): Promise<Partial<IAgentState>>;

  /**
   * [Node] 決定下一個思維節點或路徑
   */
  decideNextThought(state: IAgentState): Promise<Partial<IAgentState>>;

  /**
   * 序列化思維樹
   */
  toJSON(): Record<string, any>;
}
