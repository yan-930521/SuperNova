import { z } from 'zod';

/**
 * Phase 節點 Schema
 */
export const PhaseNodeSchema = z.object({
	id: z.string().describe("相位語義 ID (如 p1_design)"),
	type: z.literal("phase").describe("固定為 phase"),
	goal: z.string().describe("該相位的核心目標"),
	description: z.string().describe("高層級的執行策略與上下文"),
	expected_deliverables: z.array(z.string()).describe("該相位結束後預期產出的關鍵交付物")
}).describe("相位級別任務節點");

/**
 * Global 相位圖產出 Schema (Step 6 Root)
 */
export const GlobalPhaseGraphSchema = z.object({
	planning_document: z.string().describe("全局架構設計與相位拆解理由 (Markdown)"),
	phases: z.array(z.array(PhaseNodeSchema)).describe("相位矩陣。外層為時序階段，內層為並行相位。")
}).describe("規劃管線 Step 6: 全局相位圖產出");

/**
 * Work 節點 Schema
 */
export const WorkNodeSchema = z.object({
	id: z.string().describe("任務語義 ID (如 api_impl)"),
	type: z.enum(["work", "analysis", "code", "search", "test", "implementation", "fix", "documentation"]).describe("具體執行類型"),
	goal: z.string().describe("具體要達成的執行目標"),
	description: z.string().describe("詳細的執行要求與上下文"),
	dependencies: z.array(z.string()).describe("同階段內依賴的其他 Work ID"),
	success_criteria: z.string().describe("量化的驗證標準 (DoD)")
}).describe("具體執行級別任務節點");

/**
 * Local 任務圖產出 Schema (Step 6 Sub)
 */
export const LocalTaskGraphSchema = z.object({
	planning_document: z.string().describe("該相位的詳細執行計畫 (Markdown)"),
	phases: z.array(z.array(WorkNodeSchema)).describe("任務矩陣。外層為時序步驟，內層為並行任務。")
}).describe("規劃管線 Step 6: 局部任務圖產出");

/**
 * --- Pipeline Step 1-5 (Generic but Typed) ---
 */

export const GoalAnalysisSchema = z.object({
	deliverables: z.array(z.string()).describe("必須產出的交付物清單"),
	constraints: z.array(z.string()).describe("關鍵限制條件"),
	complexity_score: z.number().describe("1-10 的複雜度評分")
});

export const DecompositionSchema = z.object({
	nodes: z.array(z.object({
		id: z.string().describe("語義化 ID"),
		type: z.enum(["phase", "work"]).describe("節點類型"),
		goal: z.string().describe("核心目標"),
		description: z.string().describe("詳細說明")
	})).describe("拆解出的原始節點清單")
});

export const DependencyInferenceSchema = z.object({
	dependency_map: z.array(z.object({
		source_id: z.string().describe("目標節點 ID"),
		depends_on: z.array(z.string()).describe("依賴的前置節點 ID 列表")
	}))
});

export const VerificationBindingSchema = z.object({
	bindings: z.array(z.object({
		node_id: z.string().describe("節點 ID"),
		criteria: z.string().describe("驗證標準或交付物定義")
	}))
});

/**
 * Step 6: 最終規劃文件產出 Schema
 */
export const PlanningDocumentSchema = z.object({
	planning_document: z.string().describe("結構化的規劃文件內容 (Markdown 格式)，應包含目標分析、任務拆解理由、依賴說明及風險評估。")
}).describe("規劃管線最終產出的詳細規劃文件");
