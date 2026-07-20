import { config as dotenvConfig } from 'dotenv';
import * as readline from 'readline';

import { AgentManager } from '../src/core/agent/AgentManager';
import { AgentType } from '../src/core/agent/BaseAgent';
import { DEFAULT_CONFIG } from '../src/core/config/DefaultConfig';
import { RuntimeKernel } from '../src/core/lifecycle/RuntimeKernel';
import { DataBlock } from '../src/core/messaging/DataBlock';
import { EventBus } from '../src/core/messaging/EventBus';
import { AgentEvent, IEvent } from '../src/core/messaging/IBus';
import { SessionManager } from '../src/core/session/SessionManager';

// 讀取環境變數 (OpenAI API Key)
dotenvConfig();

async function main() {
  console.log('=============================================');
  console.log('   SuperNova v0.1.0 Interactive Demo (夏沫)');
  console.log('=============================================');
  console.log('Initializing system...');

  const config = DEFAULT_CONFIG;
  const kernel = new RuntimeKernel(config);
  
  // 1. 透過內核啟動所有系統組件 (IoC, Repo, Managers)
  await kernel.initialize();
  await kernel.start();

  // 從 Kernel 的 IoC 容器中取出我們需要的服務
  const container = kernel.getContainer();
  const eventBus = container.resolve<EventBus>('EventBus');
  const agentManager = container.resolve<AgentManager>('AgentManager');
  const sessionManager = container.resolve<SessionManager>('SessionManager');

  const MainAgentId = 'demo-mainagent';
  const sessionId = 'demo-session';

  // 2. 初始化會話 (Session)
  try {
    await sessionManager.loadSession(sessionId);
    console.log(`[系統] 載入既有會話: ${sessionId}`);
  } catch (e) {
    await sessionManager.createSession(MainAgentId, sessionId, 'PERSISTENT');
    await sessionManager.saveSession(sessionId);
    console.log(`[系統] 成功建立新會話: ${sessionId}`);
  }

  // 3. 喚醒 (Spawn) MainAgent
  try {
    // 每次 Demo 前都試圖重新建立，如果失敗則代表需要 Rehydrate
    await agentManager.spawnAgent(AgentType.MAIN, MainAgentId, sessionId);
    console.log(`[系統] 成功建立新 Agent: ${MainAgentId}`);
  } catch (e) {
    console.log(`[系統] Agent 已存在，正在喚醒 ${MainAgentId}...`);
    try {
      await agentManager.rehydrate(MainAgentId, sessionId);
    } catch (rehydrateErr) {
      console.log(`[系統] 喚醒失敗，可能檔案已損壞，嘗試重啟...`);
    }
  }

  // 4. 設定終端機對話
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = () => {
    rl.question('\n[您]: ', (input) => {
      const text = input.trim();
      if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
        console.log('系統關閉中，正在儲存記憶...');
        kernel.stop().then(() => process.exit(0));
        return;
      }

      if (!text) {
        ask();
        return;
      }

      // 發送訊息給夏沫 (指名 targetId)
      const messageBlock = new DataBlock({
        sessionId: sessionId,
        senderId: 'USER',
        targetId: MainAgentId,
        type: 'human',
        intent: 'USER_INPUT',
        controlPayload: text
      });
      
      // 透過標準的 AgentMessage 頻道廣播
      eventBus.publish({
        type: AgentEvent.AgentMessage,
        timestamp: Date.now(),
        sessionId: sessionId,
        payload: messageBlock
      });
    });
  };

  // 3. 訂閱全局 AgentMessage 來接收夏沫的回覆
  eventBus.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
    const dataBlock = event.payload;
    if (dataBlock && dataBlock.senderId === MainAgentId) {
      console.log(`\n[${MainAgentId}]: ${dataBlock.controlPayload}`);
      // 收到回覆後再繼續提問
      setTimeout(ask, 100);
    }
  });

  console.log(`\n[系統] ${MainAgentId} 已上線！輸入 "exit" 即可安全離開。`);
  ask();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
