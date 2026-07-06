import { z } from 'zod';

/**
 * 事實沉澱 Schema (Reflection)
 * 用於 ActingAgent 提煉知識與 SOP。
 */
export const ReflectionSchema = z.object({
	sop_content: z.string().describe("建議新增或更新的 SOP 內容 (Markdown，若無則提供空字串)"),
	facts: z.array(z.object({
		topic: z.string().describe("事實主題"),
		content: z.string().describe("事實內容，請以字串或 JSON 字串格式提供"),
		is_global: z.boolean().describe("是否具備跨會話的通用價值")
	})).describe("提取出的結構化事實列表"),
	improvement_briefing: z.string().describe("針對本次執行痛點的技術債或優化建議")
});
