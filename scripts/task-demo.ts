import * as dotenv from 'dotenv';

import { ChatOpenAI } from '@langchain/openai';

import { SendMessageCommand, StartSessionCommand } from '../src/application/session/SessionService';
import { Commands, Events, IEvent } from '../src/core/messaging/IBus';
import { InferenceEngine } from '../src/infra/ModelRegistry';
import { ModelPreset } from '../src/infra/types/agent';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';

dotenv.config();

/**
 * 任務執行演示 (Task Execution Demo)
 */
async function runTaskDemo() {
	console.log("💬 [SuperNova 0.3.0] 啟動任務模式...");

	const runtime = GlobalRuntime.getInstance();

	if (!process.env.OPENAI_API_KEY) {
		console.error("❌ 錯誤：未偵測到 OPENAI_API_KEY，請檢查 .env 檔案。");
		process.exit(1);
	}

	// 先啟動系統基礎設施
	await runtime.start();

	const sessionId = `demo-task-${Date.now()}`;

	// 監聽進度
	runtime.eventBus.subscribe(Events.Session.Updated, (event: IEvent<Events.Session.Updated, any>) => {
		console.log("\n🔄 [Progress Sync]:\n" + event.payload.lastSummary);
	});

	runtime.eventBus.subscribe(Events.Session.Started, (event: IEvent<Events.Session.Started, any>) => {
		console.log(`\n📢 [Event] Session Started: ${event.payload.sessionId}`);
	});

	runtime.eventBus.subscribe(Events.Task.Created, (event: IEvent<Events.Task.Created, any>) => {
		console.log(`\n📋 [Event] Task Graph Created. Processing: ${event.payload.goal}`);
	});

	await runtime.commandBus.send(new StartSessionCommand({
		sessionId,
		userId: "ADMIN",
		agentId: "main-agent-01"
	}));

	await runtime.commandBus.send(new SendMessageCommand({
		sessionId,
		userId: "ADMIN",
		content: "閱讀 ./TEST/TEST_01.md，謹慎推理出該任務之最佳解法。"
	}));

	// 等待執行完成 (簡單模擬，實際應由事件驅動)
	console.log("\n(任務已提交，請觀察日誌輸出...)");
}

runTaskDemo().catch(err => {
	console.error("Task Demo failed:", err);
	process.exit(1);
});
