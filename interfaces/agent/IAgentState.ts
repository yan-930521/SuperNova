import { BaseMessage } from '@langchain/core/messages';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { IThoughtNode } from './IThoughtEngine';
import { ITaskGraph } from './ITaskPlanEngine';

/**
 * 評價記錄接口
 */
export interface IEvaluationRecord {
  targetId: string;
  score: number;
  rationale: string;
  evaluatorId?: string;
}

/**
 * SuperNova Agent 的全局狀態結構 (LangGraph State)
 */
export interface IAgentState {
  goal: string;
  currentTask: string;
  messages: BaseMessage[];
  thoughtTree: {
    nodes: IThoughtNode[];
    rootId: string | null;
    activeNodeId: string | null;
    iterationCount: number;
  };
  planning: {
    milestones: string[];
    currentMilestoneIdx: number;
    taskGraph: ITaskGraph | null;
    projectedContext: any;
  };
  lastEvaluations: IEvaluationRecord[];
  output?: any;
  errors: string[];
  metadata?: Record<string, any>;
}

/**
 * 使用 Annotation.Root 定義的狀態結構，包含 Reducers 邏輯
 */
export const AgentStateAnnotation = Annotation.Root({
  /** 全局目標 */
  goal: Annotation<string>({
    reducer: (_, action) => action,
    default: () => "",
  }),

  /** 當前正在處理的子任務 */
  currentTask: Annotation<string>({
    reducer: (_, action) => action,
    default: () => "",
  }),

  /** 思考與對話歷史 (自動合併訊息) */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  /** 思維樹空間 */
  thoughtTree: Annotation<IAgentState['thoughtTree']>({
    reducer: (prev, action) => ({ ...prev, ...action }),
    default: () => ({
      nodes: [],
      rootId: null,
      activeNodeId: null,
      iterationCount: 0,
    }),
  }),

  /** 任務規劃空間 */
  planning: Annotation<IAgentState['planning']>({
    reducer: (prev, action) => ({ ...prev, ...action }),
    default: () => ({
      milestones: [],
      currentMilestoneIdx: 0,
      taskGraph: null,
      projectedContext: {},
    }),
  }),

  /** 最近的評價結果 */
  lastEvaluations: Annotation<IEvaluationRecord[]>({
    reducer: (prev, action) => [...prev, ...action],
    default: () => [],
  }),

  /** 最終產出 */
  output: Annotation<any>({
    reducer: (_, action) => action,
  }),

  /** 錯誤訊息 */
  errors: Annotation<string[]>({
    reducer: (prev, action) => [...prev, ...action],
    default: () => [],
  }),

  /** 元數據 */
  metadata: Annotation<Record<string, any>>({
    reducer: (prev, action) => ({ ...prev, ...action }),
    default: () => ({}),
  }),
});
