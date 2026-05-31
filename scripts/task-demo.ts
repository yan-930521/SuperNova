import * as dotenv from 'dotenv';
import * as readline from 'readline';

import { ChatOpenAI } from '@langchain/openai';

import { MainAgent } from '../src/agent/MainAgent';
import { InferenceEngine, ModelRegistry } from '../src/infra/ModelRegistry';
import { ModelPreset } from '../src/infra/types/agent';
import { IAgentMessagePayload, SystemEventType } from '../src/infra/types/events';
import { Session } from '../src/models/Session';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';

dotenv.config();

/**
 * 多輪對話互動演示 (Multi-turn Chat Demo)
 */
async function runTaskDemo() {
	console.log("💬 [SuperNova 2.0] 啟動任務模式...");
	// 初始化運行時
	const runtime = new GlobalRuntime();

	// 2. 配置真實模型 (ReAct 模式強烈建議使用 GPT-4o 或同等級模型)
	const realModel = new ChatOpenAI({
		modelName: "gpt-4o-mini",
		temperature: 0,
		apiKey: process.env.OPENAI_API_KEY
	});
	const inference = new InferenceEngine(realModel as any);
	runtime.modelRegistry.registerModel(ModelPreset.SMART, inference);
	runtime.modelRegistry.registerModel(ModelPreset.FAST, inference);
	runtime.modelRegistry.registerModel(ModelPreset.EVAL, inference);

	await runtime.start();

	// 3. 獲取 MainAgent 並建立 Session
	const mainAgent = runtime.agentManager.getAgent('main-agent-01') as MainAgent;
	if (!mainAgent) {
		throw new Error("MainAgent 'main-agent-01' not found. Please check agents/ directory.");
	}

	const EnableHistory = false;

	let session: Session;

	if (EnableHistory) {
		session = await runtime.sessionManager.getSession("demo-task") as any as Session;
	} else {
		session = await runtime.sessionManager.createSession(
			mainAgent.id,         // responsibleAgentId
			"ADMIN",              // userId
			`demo-task-${Date.now()}`        // id
		);
	}

	runtime.eventBus.subscribe<IAgentMessagePayload>(SystemEventType.AGENT_MESSAGE, (event) => {
		console.log("==========\n" + event.payload.content);
	});

	mainAgent.handleUserMessage(session, "閱讀 ./TEST/TEST_01.md，推理出最佳解答。")
}

runTaskDemo().catch(err => {
	console.error("Task Demo failed:", err);
	process.exit(1);
});
