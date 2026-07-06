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
