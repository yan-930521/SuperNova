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
	assignedAgentId: z.string().describe("指定執行的具體 Agent ID")
}).describe("TodoList 中的單個任務節點");

/**
 * TodoList 響應 Schema (TodoList Response)
 * 系統單次規劃後的完整輸出格式。
 */
export const TodoListResponseSchema = z.object({
	planning_document: z.string().describe("詳細的規劃分析與思路 (Markdown 格式)，將會儲存並提供給協調官閱讀"),
	phases: z.array(z.array(TaskNodeSchema)).describe("分階段執行的任務組。外層陣列代表先後順序，內層陣列代表該階段內可並行執行的任務。")
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

/**
 * 路由決策 Schema (Routing Decision)
 * 用於 SA 判斷任務模板。
 */
export const RoutingDecisionSchema = z.object({
	templateType: z.enum(['Instant', 'Simple', 'Standard', 'Complex', 'Exploratory', 'Emergency', 'Recursive']).describe("選定的任務 PDCA 模板類型"),
	rationale: z.string().describe("選擇該模板的語義理由與複雜度評估"),
	suggestedPriority: z.enum(['low', 'medium', 'high', 'critical']).describe("建議的執行優先級")
}).describe("SA 初始路由決策結果");

/**
 * 換檔決策 Schema (Escalation Decision)
 * 用於 SA 處理異常上報。
 */
export const EscalationDecisionSchema = z.object({
	action: z.enum(['shift', 'retry', 'abort', 'emergency_fix']).describe("換檔決策動作：shift(切換模板), retry(原地重試), abort(終止), emergency_fix(發起緊急修復)"),
	newTemplateType: z.enum(['Instant', 'Simple', 'Standard', 'Complex', 'Exploratory', 'Emergency', 'Recursive']).nullable().describe("若選擇 shift，新的模板類型，否則為 null"),
	reasoning: z.string().describe("換檔決策的深度分析與風險評估"),
	recoveryInstructions: z.string().describe("給予後續執行者的具體恢復指令或補救措施")
}).describe("SA 異常換檔決策結果");

/**
 * 事實沉澱 Schema (Reflection)
 * 用於 ActingAgent 提煉知識與 SOP。
 */
export const ReflectionSchema = z.object({
	sop_content: z.string().optional().describe("建議新增或更新的 SOP 內容 (Markdown)"),
	facts: z.array(z.object({
		topic: z.string().describe("事實主題"),
		content: z.any().describe("事實內容"),
		is_global: z.boolean().describe("是否具備跨會話的通用價值")
	})).describe("提取出的結構化事實列表"),
	improvement_briefing: z.string().describe("針對本次執行痛點的技術債或優化建議")
});

/**
 * 質量檢核 Schema (Check)
 * 用於 CheckingAgent 驗證任務產出。
 */
export const CheckSchema = z.object({
	decision: z.enum(['PASS', 'FAIL', 'ESCALATE']).describe("審核裁決：PASS(合格), FAIL(修正), ESCALATE(上報換檔)"),
	rationale: z.string().describe("詳細的裁決理由與數據證據"),
	improvement_suggestions: z.string().optional().describe("若為 FAIL，給予 DoingAgent 的具體修正指令"),
	findings: z.array(z.string()).optional().describe("審核過程中發現的潛在風險或亮點")
});
