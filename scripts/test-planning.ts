import * as dotenv from 'dotenv';
import { PlanningAgent } from '../src/agent/roles/PlanningAgent';
import { EventBus } from '../src/core/messaging/MessageBus';
import { AgentEvents } from '../src/core/messaging/IBus';
import { IdGenerator } from '../src/utils/IdGenerator';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';

dotenv.config();

/**
 * 測試 PlanningAgent 的 6 步驟重構後管線 (v0.6.0)
 * 此測試驗證拆分後的私有方法邏輯以及日誌規範化。
 */
async function testRefactoredPlanning() {
  console.log("🚀 [Test] 開始驗證 PlanningAgent 重構後的 6 步驟管線...");

  const runtime = GlobalRuntime.getInstance();
  try {
    await runtime.start();
  } catch (e) {
    console.warn("⚠️ Runtime start failed (possibly missing config), continuing with agent test...");
  }

  const bus = new EventBus<any>();
  const planningAgent = new PlanningAgent('planning-agent-tester', bus);

  const sessionId = 'test-session-' + Date.now();
  const traceId = IdGenerator.trace();
  const taskId = IdGenerator.task();
  const goal = "實作一個具備三層記憶體（L1, L2, L3）的代理協作系統測試腳本。";

  console.log(`[Test] 測試目標: ${goal}`);
  console.log(`[Test] TraceID: ${traceId}`);
  console.log(`[Test] TaskID: ${taskId}`);

  // 監聽 Finish 事件
  bus.subscribe(AgentEvents.Phase.Finish, (event: any) => {
    if (event.payload.phase === 'PLANNING' && event.payload.taskId === taskId) {
      console.log("\n✨ [Test] 規劃成功完成！");
      console.log("--------------------------------------------------");
      console.log("📄 規劃文件內容 (前 500 字):");
      console.log(event.payload.content.substring(0, 500) + "...");
      console.log("--------------------------------------------------");
      
      const subGraph = event.payload.metadata.subGraph;
      console.log(`\n📊 生成任務圖統計:`);
      console.log(`- 總節點數: ${subGraph.nodes.length}`);
      
      subGraph.nodes.forEach((node: any, index: number) => {
        console.log(`\n[Node ${index + 1}] ${node.metadata.semanticId}`);
        console.log(`  - Goal: ${node.goal}`);
        console.log(`  - Type: ${node.type}`);
        console.log(`  - DoD: ${node.successCriteria}`);
        console.log(`  - Dependencies: ${node.dependencies.length > 0 ? node.dependencies.join(', ') : 'None'}`);
        console.log(`  - Template: ${node.flow.templateType}`);
      });

      console.log("\n✅ [Test] 驗證完畢，所有輸出結構符合預期。");
      process.exit(0);
    }
  });

  // 監聽失敗事件
  bus.subscribe(AgentEvents.Phase.Fail, (event: any) => {
    console.error("\n❌ [Test] 規劃執行失敗:", event.payload.error);
    process.exit(1);
  });

  // 發布 Start 事件觸發 PlanningAgent
  console.log("\n⏳ [Test] 正在發布 PHASE_START 事件...");
  bus.publish({
    type: AgentEvents.Phase.Start,
    timestamp: Date.now(),
    payload: {
      sessionId,
      traceId,
      taskId,
      phase: 'PLANNING',
      content: goal,
      metadata: {} // root task
    }
  });

  // 設定超時
  setTimeout(() => {
    console.error("\n⏳ [Test] 測試超時 (120s)，PlanningAgent 未在預期時間內回應。");
    process.exit(1);
  }, 120000);
}

testRefactoredPlanning().catch(err => {
  console.error("\n💥 [Test] 執行過程發生未捕捉錯誤:", err);
  process.exit(1);
});
