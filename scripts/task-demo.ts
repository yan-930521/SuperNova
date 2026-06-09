import * as dotenv from 'dotenv';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { AgentEvents, SystemEvents } from '../src/core/messaging/IBus';
import { IdGenerator } from '../src/utils/IdGenerator';

dotenv.config();

/**
 * SuperNova 0.4.0 全自動 PDCA 任務演示 (Task Demo)
 * 展示從目標分派、規劃、執行、檢核到改善的全流程自動流轉。
 */
async function runTaskDemo() {
  console.log("🚀 [SuperNova 0.4.0] 啟動全自動 PDCA 任務演示...");

  const runtime = GlobalRuntime.getInstance();

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ 錯誤：未偵測到 OPENAI_API_KEY，請檢查 .env 檔案。");
    process.exit(1);
  }

  // 1. 啟動系統基礎設施 (包含 DI 容器與服務，且已內建初始化 Agent 單例)
  await runtime.start();

  const bus = runtime.agentBus;
  const sysBus = runtime.systemBus;

  console.log("🤖 所有專業角色 Agent 已初始化並就位。");

  // 2. 設置全局監聽，以便在 Console 看到流轉過程 (不包含 Tick 事件以避免洗版)
  bus.subscribe('*', (event: any) => {
    if (event.type === (SystemEvents.Runtime.Tick as string)) return;
    
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    const color = event.type.includes('Fail') || event.type.includes('Escalate') ? '\x1b[31m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(`\n${color}[${timestamp}] 📡 事件: ${event.type}${reset}`);
    if (event.payload.taskId) console.log(`   └─ 任務ID: ${event.payload.taskId}`);
    if (event.payload.goal) console.log(`   └─ 目標: ${event.payload.goal}`);
    if (event.payload.content) {
      const preview = String(event.payload.content).substring(0, 150).replace(/\n/g, ' ');
      console.log(`   └─ 內容: ${preview}...`);
    }
  });

  // 3. 定義任務目標
  const sessionId = `demo-session-${Date.now()}`;
  const goal = "在當前專案根目錄建立一個 'demo_output' 資料夾，並在其中生成一個 'pdca_report.md' 檔案，內容必須包含『SuperNova 0.4.0 運行測試成功』字樣以及當前的系統時間。";

  console.log(`\n🎯 提交初始目標: ${goal}`);

  // 4. 啟動脈搏心跳 (每 5 秒發送一次 Tick 事件，供 Scheduler 調度)
  const tickInterval = setInterval(() => {
    sysBus.publish({
      type: SystemEvents.Runtime.Tick,
      timestamp: Date.now(),
      payload: { spanId: IdGenerator.span('sys') }
    });
  }, 5000);

  // 5. 正式發布初始分派指令
  bus.publish({
    type: AgentEvents.Supervisor.Dispatch,
    timestamp: Date.now(),
    payload: {
      sessionId,
      goal,
      spanId: IdGenerator.span('user')
    }
  });

  console.log("\n⏳ 系統運行中，請觀察日誌輸出... (按 Ctrl+C 可強制終止)");

  // 處理優雅退出
  process.on('SIGINT', async () => {
    console.log("\n🛑 正在停止系統...");
    clearInterval(tickInterval);
    await runtime.stop();
    process.exit(0);
  });
}

runTaskDemo().catch(err => {
  console.error("❌ Demo 執行失敗:", err);
  process.exit(1);
});
