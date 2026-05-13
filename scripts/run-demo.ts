import * as dotenv from 'dotenv';
import { z } from 'zod';

import { ChatOpenAI } from '@langchain/openai';

import { ModelPreset } from '../interfaces/runtime/IModelRegistry';
import { CoordinatorAgent } from '../src/agent/CoordinatorAgent';
import { TaskPlanEngine } from '../src/agent/TaskPlanEngine';
import { WorkerAgent } from '../src/agent/WorkerAgent';
import { AgentRegistry } from '../src/infra/AgentRegistry';
import { EventBus } from '../src/infra/EventBus';
import { SessionManager } from '../src/infra/SessionManager';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { InferenceEngine, ModelRegistry } from '../src/runtime/ModelRegistry';
import { BaseSession } from '../src/session/BaseSession';
import { BaseTool } from '../src/tool/BaseTool';

dotenv.config();

// 1. 建立具有 Zod 驗證的工具
class MockSearchTool extends BaseTool<{ query: string }, string> {
	constructor() {
		super(
			'WebSearch',
			'Search the web for a specific query',
			'TIER_1',
			['SEARCH'],
			z.object({ query: z.string().describe("The search query") })
		);
	}
	async run(input: { query: string }): Promise<string> {
		console.log(`\n🔍 [WebSearchTool] 執行搜尋: "${input.query}"`);
		return `Results for ${input.query}: SuperNova is a modular AI runtime that integrates LangGraph and LangChain.`;
	}
}

class MockAnalyzeTool extends BaseTool<{ data: string }, string> {
	constructor() {
		super(
			'Analyze',
			'Analyze provided data and extract insights',
			'TIER_1',
			['ANALYZE'],
			z.object({ data: z.string().describe("The data to analyze") })
		);
	}
	async run(input: { data: string }): Promise<string> {
		console.log(`\n🧠 [AnalyzeTool] 執行分析: "${input.data}"`);
		return `Analysis: The data describes SuperNova's core architecture and integration capabilities.`;
	}
}

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

	// C. 註冊工具
	toolRegistry.register(new MockSearchTool());
	toolRegistry.register(new MockAnalyzeTool());

	// D. 註冊 Agent
	const coordinator = new CoordinatorAgent(new TaskPlanEngine(modelRegistry));
	await coordinator.initFromJSON({ id: 'coord-01', role: 'COORDINATOR' });
	agentRegistry.register(coordinator);

	// 2. 啟動 Runtime
	await runtime.start();

	// 3. 建立 Session 並讓 Coordinator 規劃任務
	const goal = "Search for information about SuperNova AI runtime and analyze its core features.";
	console.log(`🎯 目標: "${goal}"`);
	
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
	const maxTicks = 20;

	while (session.taskGraph.size > 0 || session.readyQueue.length > 0) {
		await session.tick();
		tickCount++;
		if (tickCount >= maxTicks) {
			console.warn("\n⚠️ 達到最大 Tick 限制，停止執行。");
			break;
		}
		// 等待一點時間模擬異步執行
		await new Promise(resolve => setTimeout(resolve, 500));
	}

	console.log("\n🎉 [SuperNova Demo] 任務執行流程結束！");
	
	// 5. 輸出結果 (模擬)
	console.log("\n--- 執行結果摘要 ---");
	console.log("Session ID:", session.id);
	console.log("Final Status:", session.status);

	await runtime.stop();
}

if (process.env.OPENAI_API_KEY) {
	runDemo().catch(console.error);
} else {
	console.error("❌ 錯誤: 請在 .env 中配置 OPENAI_API_KEY。");
}
