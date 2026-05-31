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
 * 任務節點 Schema (Task Node)
 * 定義 TodoList 中的單一執行單元。
 */
export const TaskNodeSchema = z.object({
	id: z.string().describe("任務唯一識別碼 (如 task_1)"),
	type: z.enum(["analysis", "code", "search", "test", "work", "implementation", "fix", "documentation"]).describe("任務執行類型"),
	goal: z.string().describe("該任務具體要達成的目標"),
	description: z.string().describe("詳細的執行要求、上下文與驗證標準"),
	assignedAgentId: z.string().describe("指定執行的具體 Agent ID"),
	dependencies: z.array(z.string()).describe("此任務所依賴的前置任務 ID 列表")
}).describe("TodoList 中的單個任務節點");

/**
 * TodoList 響應 Schema (TodoList Response)
 * 系統單次規劃後的完整輸出格式。
 */
export const TodoListResponseSchema = z.object({
	planning_document: z.string().describe("詳細的規劃分析與思路 (Markdown 格式)，將會儲存並提供給協調官閱讀"),
	tasks: z.array(TaskNodeSchema).describe("扁平的任務清單。若可並行執行，dependencies 為空；若需依序，填入前置任務的 ID。")
}).describe("最終的 TodoList 產出");

/**
 * ReAct 執行響應 Schema
 * 用於代理在執行任務時的單步思考與動作決策。
 */
export const ReActResponseSchema = z.object({
	thought: z.string().describe("當前的思考過程"),
	action: z.object({
		toolName: z.string().describe("欲呼叫的工具名稱"),
		args: z.any().describe("傳給工具的參數")
	}).nullable().describe("下一步要執行的動作，若已完成則為 null"),
	answer: z.string().nullable().describe("最終答案，若尚未完成則為 null")
}).describe("ReAct 代理的單步決策");

/**
 * 環境投影 Schema (Context Projection)
 * 用於預測執行後的狀態變化。
 */
export const ContextProjectionSchema = z.object({
	expectedSnapshot: z.string().describe("執行完成後的預期世界狀態快照摘要"),
	keyDeliverables: z.array(z.string()).describe("預期產出的關鍵交付物列表"),
	newConstraints: z.array(z.string()).describe("執行後可能出現的新限制或資源變化")
}).describe("預測的未來狀態快照");
