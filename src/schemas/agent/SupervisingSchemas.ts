import { z } from 'zod';

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
