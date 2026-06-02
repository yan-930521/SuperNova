import { BaseMessage } from '@langchain/core/messages';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

import { TaskGraphData } from '../../infra/types/task';

/**
 * 評價記錄結構
 */
export interface EvaluationRecord {
  targetId: string;
  score: number;
  rationale: string;
  evaluatorId?: string;
}

/**
 * SuperNova Agent 的全局狀態結構 (LangGraph State)
 */
export interface AgentState {
  /** 當前目標 (執行模式必填，聊天模式可選) */
  goal?: string;
  description?: string;
  /** 當前正在處理的子任務或話題 */
  currentTask?: string;
  /** 思考與對話歷史 */
  messages: BaseMessage[];
  /** 思維樹空間 (執行模式) */
  thoughtTree?: {
    nodes: unknown[];
    rootId: string | null;
    activeNodeId: string | null;
    iterationCount: number;
  };
  /** 任務規劃空間 (執行模式) */
  planning?: {
    milestones: string[];
    currentMilestoneIdx: number;
    taskGraph: TaskGraphData | null;
    projectedContext: unknown;
  };
  /** 最近的評價結果 */
  lastEvaluations?: EvaluationRecord[];
  /** 最終產出 */
  output?: unknown;
  /** 錯誤訊息 */
  errors?: string[];
  /** 元數據 */
  metadata?: Record<string, unknown>;
}

/**
 * 使用 Annotation.Root 定義的狀態結構，包含 Reducers 邏輯
 */
export const AgentStateAnnotation = Annotation.Root({
  /** 全局目標 */
  goal: Annotation<string | undefined>({
    reducer: (_, action) => action,
    default: () => undefined,
  }),

  /** 詳細描述 */
  description: Annotation<string | undefined>({
    reducer: (_, action) => action,
    default: () => undefined,
  }),

  /** 當前任務或話題 */
  currentTask: Annotation<string | undefined>({
    reducer: (_, action) => action,
    default: () => undefined,
  }),

  /** 對話歷史 */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  /** 思維樹空間 */
  thoughtTree: Annotation<Required<NonNullable<AgentState['thoughtTree']>>>({
    reducer: (prev, action) => ({
      nodes: action?.nodes ?? prev.nodes,
      rootId: action?.rootId ?? prev.rootId,
      activeNodeId: action?.activeNodeId ?? prev.activeNodeId,
      iterationCount: action?.iterationCount ?? prev.iterationCount,
    }),
    default: () => ({
      nodes: [],
      rootId: null,
      activeNodeId: null,
      iterationCount: 0,
    }),
  }),

  /** 任務規劃空間 */
  planning: Annotation<Required<NonNullable<AgentState['planning']>>>({
    reducer: (prev, action) => ({
      milestones: action?.milestones ?? prev.milestones,
      currentMilestoneIdx: action?.currentMilestoneIdx ?? prev.currentMilestoneIdx,
      taskGraph: action?.taskGraph ?? prev.taskGraph,
      projectedContext: action?.projectedContext ?? prev.projectedContext,
    }),
    default: () => ({
      milestones: [],
      currentMilestoneIdx: 0,
      taskGraph: null,
      projectedContext: {},
    }),
  }),

  /** 最近的評價結果 */
  lastEvaluations: Annotation<EvaluationRecord[]>({
    reducer: (prev, action) => [...(prev || []), ...(action || [])],
    default: () => [],
  }),

  /** 最終產出 */
  output: Annotation<unknown>({
    reducer: (_, action) => action,
  }),

  /** 錯誤訊息 */
  errors: Annotation<string[]>({
    reducer: (prev, action) => [...(prev || []), ...(action || [])],
    default: () => [],
  }),

  /** 元數據 */
  metadata: Annotation<Record<string, unknown>>({
    reducer: (prev, action) => ({ ...prev, ...action }),
    default: () => ({}),
  }),
});
