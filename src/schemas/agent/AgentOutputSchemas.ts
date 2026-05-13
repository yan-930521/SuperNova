import { z } from 'zod';

/**
 * 思維分支生成 Schema (Thought Generation)
 */
export const ThoughtBranchSchema = z.object({
  content: z.string().describe("思路的核心觀點與預期效果"),
  type: z.enum(["strategic", "technical", "analytical"]).describe("思路的類型分類")
}).describe("單個思維分支節點");

export const ThoughtGenResponseSchema = z.array(ThoughtBranchSchema).describe("產出的思維分支列表");

/**
 * 思維評價 Schema (Thought Evaluation)
 */
export const EvaluationResultSchema = z.object({
  targetId: z.string().describe("被評價對象的 ID"),
  score: z.number().min(0).max(10).describe("0-10 的綜合評分"),
  rationale: z.string().describe("具體的打分理由與改進建議")
}).describe("單個思路的評價結果");

export const ThoughtEvalResponseSchema = z.array(EvaluationResultSchema).describe("批次評價結果列表");

/**
 * 里程碑規劃 Schema (Milestone Planning)
 */
export const MilestonePlanSchema = z.object({
  milestones: z.array(z.string()).describe("有序的里程碑描述列表")
}).describe("全局目標拆解出的里程碑方案");

/**
 * 任務圖展開 Schema (Task Expansion)
 */
export const TaskNodeSchema = z.object({
  id: z.string().describe("任務唯一識別碼 (如 task_1)"),
  type: z.enum(["analysis", "code", "search", "test", "work"]).describe("任務執行類型"),
  goal: z.string().describe("該任務具體要達成的目標"),
  assignedAgentId: z.string().optional().describe("指定執行的具體 Agent ID (若可用)"),
  assignedRole: z.string().describe("最適合執行此任務的 Agent 角色"),
  dependencies: z.array(z.string()).describe("此任務所依賴的前置任務 ID 列表")
}).describe("DAG 中的單個任務節點");

export const TaskExpandResponseSchema = z.object({
  nodes: z.array(TaskNodeSchema).describe("展開後的任務節點列表")
}).describe("里程碑細化後的任務圖結構");

/**
 * 規劃審查 Schema (Plan Review)
 */
export const PlanReviewSchema = z.object({
  score: z.number().min(0).max(10).describe("對任務圖合理性的評分"),
  rationale: z.string().describe("詳細的審核意見，包括依賴檢查與目標覆蓋率分析")
}).describe("針對規劃方案的審查報告");

/**
 * 環境投影 Schema (Context Projection)
 */
export const ContextProjectionSchema = z.object({
  expectedSnapshot: z.string().describe("執行完成後的預期世界狀態快照摘要"),
  keyDeliverables: z.array(z.string()).describe("預期產出的關鍵交付物列表"),
  newConstraints: z.array(z.string()).describe("執行後可能出現的新限制或資源變化")
}).describe("預測的未來狀態快照");
