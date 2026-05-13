import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { ChatOpenAI } from '@langchain/openai';

import { ModelPreset } from '../interfaces/runtime/IModelRegistry';
import { CoordinatorAgent } from '../src/agent/CoordinatorAgent';
import { AgentRegistry } from '../src/infra/AgentRegistry';
import { EventBus } from '../src/infra/EventBus';
import { SessionManager } from '../src/infra/SessionManager';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { InferenceEngine, ModelRegistry } from '../src/runtime/ModelRegistry';
import { BaseSession } from '../src/session/BaseSession';
import { TavilySearchTool } from '../src/tool/common/TavilySearchTool';
import { WriteFileTool } from '../src/tool/file/WriteFileTool';

dotenv.config();

async function runDemo() {
	console.log("🚀 [SuperNova Demo] 系統初始化 (Real Planning & ReAct Execution)...\n");

	// A. 初始化核心基礎設施
	const eventBus = new EventBus();
	const sessionManager = new SessionManager();
	const toolRegistry = new ToolRegistry();
	
	// B. 配置真實模型
	const realModel = new ChatOpenAI({ 
		modelName: "gpt-4o-mini", 
		temperature: 0,
		apiKey: process.env.OPENAI_API_KEY
	});
	const modelRegistry = new ModelRegistry();
	const inference = new InferenceEngine(realModel as any);
	modelRegistry.registerModel(ModelPreset.SMART, inference);
	modelRegistry.registerModel(ModelPreset.FAST, inference);
	modelRegistry.registerModel(ModelPreset.EVAL, inference);

	const agentRegistry = new AgentRegistry(modelRegistry, toolRegistry);
	const runtime = new GlobalRuntime(sessionManager, eventBus, agentRegistry);

	// C. 註冊真實工具
	toolRegistry.register(new TavilySearchTool());
	toolRegistry.register(new WriteFileTool());

	// D. 啟動 Runtime
	await runtime.start();

	// 獲取 Coordinator 並確保其知道其他 Ready Agent
	const coordinator = agentRegistry.getAgent('coordinator-01') as CoordinatorAgent;
	if (!coordinator) {
		throw new Error("找不到 coordinator-01，請檢查 ./agents/coordinator-01.json");
	}

	// 建立 Session 並讓 Coordinator 規劃任務
	const goal = `請執行以下流程並產出純中文報告：
1. 搜索 2025-2026 年遠端工作對心理健康影響的最新趨勢。
2. 分析這些趨勢對員工生產力的具體心理影響。
3. 由專業心理諮商師 (THERAPIST) 提供針對管理者的同理心支持建議。
4. 將以上內容彙整，使用 WriteFile 工具儲存為 "health_report.md"。`;
	
	const session = await sessionManager.createFromJSON({
		id: 'demo-session',
		goal: goal
	}) as BaseSession;
	session.agentRegistry = agentRegistry;

	console.log("\n📝 [Coordinator] 正在自動規劃任務圖...");
	
	
	const taskGraph = await coordinator.planTaskGraph(goal);
	
	await session.loadFromJSON({ taskGraph });

	console.log(`\n✅ 規劃完成，共 ${session.taskGraph.size} 個任務。`);
	console.log("\n▶️ [SuperNova Demo] 啟動執行循環...");

	// 4. 執行循環
	let tickCount = 0;
	const maxTicks = 30;

	while (session.taskGraph.size > 0 || session.readyQueue.length > 0) {
		try {
			await session.tick();
		} catch (err) {
			console.error("\n❌ 執行循環發生錯誤:", err);
			break;
		}
		tickCount++;
		if (tickCount >= maxTicks) {
			console.warn("\n⚠️ 達到最大 Tick 限制，停止執行。");
			break;
		}
		await new Promise(resolve => setTimeout(resolve, 3000));
	}

	console.log("\n🎉 [SuperNova Demo] 任務流程執行完畢！");
	
	// 5. 輸出結果與驗證檔案
	console.log("\n--- 驗證執行結果 ---");
	const reportPath = path.join(process.cwd(), 'workspace', 'health_report.md');
	if (fs.existsSync(reportPath)) {
		console.log(`✅ 報告已生成: ${reportPath}`);
		const stats = fs.statSync(reportPath);
		console.log(`📏 檔案大小: ${stats.size} bytes`);
	} else {
		console.error("❌ 失敗: 找不到預期的報告檔案 workspace/health_report.md");
	}

	await runtime.stop();
}

if (process.env.OPENAI_API_KEY && process.env.TAVILY_API_KEY) {
	runDemo().catch(console.error);
} else {
	console.error("❌ 錯誤: 請在 .env 中配置 OPENAI_API_KEY 和 TAVILY_API_KEY。");
}
