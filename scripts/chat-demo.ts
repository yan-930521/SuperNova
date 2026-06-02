import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { ChatOpenAI } from '@langchain/openai';

import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { InferenceEngine } from '../src/infra/ModelRegistry';
import { ModelPreset } from '../src/infra/types/agent';
import { Commands, Events, IEvent } from '../src/core/messaging/IBus';
import { StartSessionCommand, SendMessageCommand } from '../src/application/session/SessionService';

dotenv.config();

/**
 * SuperNova 0.3.0 多輪對話演示 (Command-Driven Chat Demo)
 */
async function runChatDemo() {
  console.log("🚀 [SuperNova 0.3.0] 啟動 Command-Driven 對話模式...");
  console.log("輸入 'exit' 或 'quit' 結束對話。\n");
const runtime = GlobalRuntime.getInstance();

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ 錯誤：未偵測到 OPENAI_API_KEY，請檢查 .env 檔案。");
  process.exit(1);
}

// 1. 先啟動系統基礎設施
await runtime.start();

// 2. 配置真實模型
const realModel = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY
});

const inference = new InferenceEngine(realModel as any);
runtime.modelRegistry.registerModel(ModelPreset.SMART, inference);
runtime.modelRegistry.registerModel(ModelPreset.FAST, inference);
runtime.modelRegistry.registerModel(ModelPreset.EVAL, inference);

const sessionId = "demo-session";


  // 4. 監聽系統事件，輸出非同步反饋
  runtime.eventBus.subscribe(Events.Session.Started, (event: IEvent<Events.Session.Started, any>) => {
    console.log(`\n📢 [Event] Session Started: ${event.payload.sessionId}`);
  });

  runtime.eventBus.subscribe(Events.Task.Created, (event: IEvent<Events.Task.Created, any>) => {
    console.log(`\n📋 [Event] Task Graph Created. Processing: ${event.payload.goal}`);
  });

  runtime.eventBus.subscribe(Events.Session.Updated, (event: IEvent<Events.Session.Updated, any>) => {
    console.log(`\n🔄 [Event] Progress Sync: ${event.payload.lastSummary}`);
  });

  // 5. 建立互動介面
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '【User】> '
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log("\n👋 感謝使用，再見！");
      await runtime.stop();
      process.exit(0);
    }

    if (!input) {
      rl.prompt();
      return;
    }

    try {
      // 獲取 SessionService 實例 (透過 runtime.container)
      const sessionService = runtime.container.resolve<any>('SessionService');
      const existingSession = sessionService.getSession(sessionId);

      if (!existingSession) {
        // 第一次對話：發送 Start 指令
        console.log(`\n⏳ [System] Initializing Session...`);
        await runtime.commandBus.send(new StartSessionCommand({
          sessionId,
          userId: "ADMIN",
          agentId: "main-agent-01"
        }));
      } else {
        // 後續對話：發送 SendMessage 指令
        console.log(`\n⏳ [System] Sending Message...`);
        await runtime.commandBus.send(new SendMessageCommand({
          sessionId,
          userId: "ADMIN",
          content: input
        }));
      }

    } catch (err: any) {
      console.error(`\n❌ [Error]: ${err.message}\n`);
    }

    rl.prompt();
  }).on('close', async () => {
    console.log("\n👋 會話關閉。");
    await runtime.stop();
    process.exit(0);
  });
}

runChatDemo().catch(err => {
  console.error("Chat Demo failed:", err);
  process.exit(1);
});

runChatDemo().catch(err => {
  console.error("Chat Demo failed:", err);
  process.exit(1);
});
