import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { AgentEvents, SystemEvents } from '../src/core/messaging/IBus';
import { IdGenerator } from '../src/utils/IdGenerator';

dotenv.config();

/**
 * SuperNova 0.5.0 互動式對話演示 (Chat Demo)
 * 允許使用者透過 CLI 與 SupervisorAgent 進行對話，釐清目標後啟動 PDCA。
 */
async function runChatDemo() {
  console.log("\x1b[36m%s\x1b[0m", "🚀 [SuperNova 0.5.0] 啟動互動式對話演示...");

  const runtime = GlobalRuntime.getInstance();

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ 錯誤：未偵測到 OPENAI_API_KEY，請檢查 .env 檔案。");
    process.exit(1);
  }

  // 1. 啟動系統基礎設施
  await runtime.start();

  const bus = runtime.agentBus;
  const sysBus = runtime.systemBus;
  const sessionId = `chat-session-${Date.now()}`;

  console.log("🤖 系統已就緒。請輸入您的目標（或輸入 'exit' 退出）。");

  // 2. 設置日誌監聽器
  bus.subscribe('*', (event: any) => {
    if (event.type === (SystemEvents.Runtime.Tick as string)) return;
    
    // 如果是 Supervisor 的回覆，特別標註
    if (event.type === AgentEvents.Control.Chat && event.payload.metadata?.finalAnswer) {
      console.log(`\n\x1b[33m[Supervisor]:\x1b[0m ${event.payload.metadata.finalAnswer}`);
      process.stdout.write("\n\x1b[32m[You]: \x1b[0m"); // 重新印出提示符
    } else {
      // 其他背景事件以灰度顯示
      const timestamp = new Date(event.timestamp).toLocaleTimeString();
      const color = event.type.includes('Fail') || event.type.includes('Escalate') ? '\x1b[31m' : '\x1b[90m';
      const reset = '\x1b[0m';
      console.log(`\n${color}[${timestamp}] 📡 背景事件: ${event.type}${reset}`);
      if (event.payload.taskId) console.log(`${color}   └─ 任務ID: ${event.payload.taskId}${reset}`);
    }
  });

  // 3. 啟動脈搏心跳 (調度子任務需要)
  const tickInterval = setInterval(() => {
    sysBus.publish({
      type: SystemEvents.Runtime.Tick,
      timestamp: Date.now(),
      payload: { spanId: IdGenerator.span('sys') }
    });
  }, 5000);

  // 4. 互動對話迴圈
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[32m[You]: \x1b[0m'
  });

  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();
    
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      rl.close();
      return;
    }

    if (input) {
      // 發布對話事件
      bus.publish({
        type: AgentEvents.Control.Chat,
        timestamp: Date.now(),
        payload: {
          sessionId,
          content: input,
          spanId: IdGenerator.span('user')
        }
      });
    } else {
      rl.prompt();
    }
  }).on('close', async () => {
    console.log("\n🛑 正在停止系統...");
    clearInterval(tickInterval);
    await runtime.stop();
    process.exit(0);
  });
}

runChatDemo().catch(err => {
  console.error("❌ Demo 執行失敗:", err);
  process.exit(1);
});
