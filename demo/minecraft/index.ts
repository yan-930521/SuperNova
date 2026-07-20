import { config as dotenvConfig } from 'dotenv';
import * as mineflayer from 'mineflayer';
import { AgentManager } from '../../src/core/agent/AgentManager';
import { AgentType } from '../../src/core/agent/BaseAgent';
import { DEFAULT_CONFIG } from '../../src/core/config/DefaultConfig';
import { RuntimeKernel } from '../../src/core/lifecycle/RuntimeKernel';
import { DataBlock } from '../../src/core/messaging/DataBlock';
import { EventBus } from '../../src/core/messaging/EventBus';
import { AgentEvent, IEvent } from '../../src/core/messaging/IBus';
import { SessionManager } from '../../src/core/session/SessionManager';
import { setupAgentEvents } from './event/agentEvents';
import { setupMineflayerEvents } from './event/mineflayerEvents';

// 讀取環境變數 (OpenAI API Key 等)
dotenvConfig();

async function main() {
  console.log('=============================================');
  console.log('   SuperNova Minecraft Embodied Agent Demo');
  console.log('=============================================');
  console.log('Initializing system...');

  const config = DEFAULT_CONFIG;
  const kernel = new RuntimeKernel(config);
  
  // 1. 透過內核啟動所有系統組件 (IoC, Repo, Managers)
  await kernel.initialize();
  await kernel.start();

  // 從 Kernel 的 IoC 容器中取出服務
  const container = kernel.getContainer();
  const eventBus = container.resolve<EventBus>('EventBus');
  const agentManager = container.resolve<AgentManager>('AgentManager');
  const sessionManager = container.resolve<SessionManager>('SessionManager');

  const EmbodiedAgentId = 'minecraft-bot-01';
  const sessionId = 'minecraft-session';

  // 2. 初始化會話 (Session)
  try {
    await sessionManager.loadSession(sessionId);
    console.log(`[系統] 載入既有會話: ${sessionId}`);
  } catch (e) {
    await sessionManager.createSession(EmbodiedAgentId, sessionId, 'PERSISTENT');
    await sessionManager.saveSession(sessionId);
    console.log(`[系統] 成功建立新會話: ${sessionId}`);
  }

  // 3. 喚醒 (Spawn) EmbodiedAgent
  try {
    await agentManager.spawnAgent(AgentType.EMBODIED, EmbodiedAgentId, sessionId);
    console.log(`[系統] 成功建立新 Agent: ${EmbodiedAgentId}`);
  } catch (e) {
    console.log(`[系統] Agent 已存在，正在喚醒 ${EmbodiedAgentId}...`);
    try {
      await agentManager.rehydrate(EmbodiedAgentId, sessionId);
    } catch (rehydrateErr) {
      console.log(`[系統] 喚醒失敗，可能檔案已損壞，嘗試重啟...`);
      process.exit(1);
    }
  }

  // 4. 初始化 Mineflayer 機器人 (軀殼 Body)
  const host = process.env.MINECRAFT_HOST || '127.0.0.1';
  const port = parseInt(process.env.MINECRAFT_PORT || '25565', 10);
  const username = process.env.MINECRAFT_USERNAME || 'SuperNovaBot';

  console.log(`[Mineflayer] Connecting to ${host}:${port} as ${username}...`);
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    auth: 'offline'
  });

  // 5. 感官映射 (Sensors -> EventBus)
  setupMineflayerEvents(bot, eventBus, sessionId, EmbodiedAgentId);

  // 6. 行動映射 (EventBus -> Actuators)
  setupAgentEvents(bot, eventBus, EmbodiedAgentId);

  // 優雅停機處理
  const shutdown = async () => {
    console.log('\n系統關閉中，正在儲存記憶...');
    bot.quit();
    await kernel.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
