import { z } from 'zod';

/**
 * 質量檢核 Schema (Check)
 * 用於 CheckingAgent 驗證任務產出。
 */
export const CheckSchema = z.object({
	decision: z.enum(['PASS', 'FAIL', 'ESCALATE']).describe("審核裁決：PASS(合格), FAIL(修正), ESCALATE(上報換檔)"),
	rationale: z.string().describe("詳細的裁決理由與數據證據"),
	improvement_suggestions: z.string().describe("若為 FAIL，給予 DoingAgent 的具體修正指令 (若為 PASS 則提供空字串)"),
	findings: z.array(z.string()).describe("審核過程中發現的潛在風險或亮點 (可為空陣列)")
});
