import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { ChatOpenAI } from '@langchain/openai';

import { MainAgent } from '../src/agent/MainAgent';
import { AgentRegistry } from '../src/infra/AgentRegistry';
import { EventBus } from '../src/infra/EventBus';
import { InferenceEngine, ModelPreset, ModelRegistry } from '../src/infra/ModelRegistry';
import { SessionManager } from '../src/infra/SessionManager';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';

dotenv.config();

/**
 * 多輪對話互動演示 (Multi-turn Chat Demo)
 */
async function runChatDemo() {
  console.log("💬 [SuperNova 2.0] 啟動多輪對話模式...");
  console.log("輸入 'exit' 或 'quit' 結束對話。\n");

  // 1. 初始化全域運行時
  const runtime = new GlobalRuntime(
    new SessionManager(),
    new AgentRegistry(),
    new EventBus(),
    new ModelRegistry()
  );

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
  const mainAgent = runtime.agentRegistry.getAgent('main-agent-01') as MainAgent;
  const session = runtime.sessionManager.createSession(
    "多輪對話會話", 
    mainAgent.id, 
    "interactive-chat-session"
  );

  // 4. 建立 Readline 介面
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
      process.exit(0);
    }

    if (!input) {
      rl.prompt();
      return;
    }

    try {
      // 呼叫 MainAgent 處理訊息 (ReAct 模式)
      const response = await mainAgent.handleUserMessage(session, input);
      console.log(`\n【Assistant】> ${response}\n`);
    } catch (err: any) {
      console.error(`\n❌ 發生錯誤: ${err.message}\n`);
    }

    rl.prompt();
  }).on('close', () => {
    console.log("\n👋 會話已關閉。");
    process.exit(0);
  });
}

runChatDemo().catch(err => {
  console.error("Chat Demo failed:", err);
  process.exit(1);
});
