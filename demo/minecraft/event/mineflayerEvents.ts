import { Bot } from 'mineflayer';
// @ts-ignore - prismarine-viewer may not have type definitions
import { mineflayer as mineflayerViewer } from 'prismarine-viewer';
import { EventBus } from '../../../src/core/messaging/EventBus';
import { publishSensorEvent } from './helper';

let viewerStarted = false;

/**
 * 註冊 Mineflayer 機器人的各種感官事件，並轉換為 Agent 事件
 */
export function setupMineflayerEvents(bot: Bot, eventBus: EventBus, sessionId: string, embodiedAgentId: string) {
  bot.on('spawn', () => {
    console.log('[Mineflayer] Bot spawned in the world!');
    publishSensorEvent(
      eventBus,
      sessionId,
      embodiedAgentId,
      'system',
      'You have just spawned in the Minecraft world. You can now explore or chat.'
    );

    // 啟動視角串流 (確保只啟動一次，避免重生時重複佔用 Port)
    if (!viewerStarted) {
      viewerStarted = true;
      try {
        mineflayerViewer(bot, { port: 3007, firstPerson: true });
        console.log('[Viewer] 網頁視角伺服器已啟動！請在瀏覽器開啟 http://localhost:3007');
      } catch (e) {
        console.error('[Viewer] 啟動視角伺服器失敗:', e);
      }
    }
  });

  bot.on('chat', (player, message) => {
    if (player === bot.username) return; // 忽略自己的講話
    console.log(`[Mineflayer] Chat [${player}]: ${message}`);
    
    publishSensorEvent(
      eventBus,
      sessionId,
      embodiedAgentId,
      'human',
      `Player ${player} says: ${message}`
    );
  });

  // 1. 監聽受傷事件 (身體警報)
  let lastHurtTime = 0;
  bot.on('entityHurt', (entity) => {
    if (entity === bot.entity) {
      const currentHealth = bot.health;
      console.log(`[Mineflayer] Bot hurt! Health: ${currentHealth}`);
      
      const now = Date.now();
      // 避免連續受傷（如著火、中毒、飢餓）導致洗版大腦，設定 5 秒冷卻時間 (Throttle)
      if (now - lastHurtTime > 5000) {
        lastHurtTime = now;
        publishSensorEvent(
          eventBus,
          sessionId,
          embodiedAgentId,
          'system',
          `[身體警報] 痛！你受到了傷害，當前生命值剩下 ${currentHealth.toFixed(1)}/20。請評估當前狀況是否需要撤退或避險。`
        );
      }
    }
  });

  // 2. 監聽死亡事件
  bot.on('death', () => {
    console.log('[Mineflayer] Bot died.');
    publishSensorEvent(
      eventBus,
      sessionId,
      embodiedAgentId,
      'system',
      '[身體警報] 你已經死亡！即將重生。請在重生後考慮尋回掉落的裝備。'
    );
  });

  // 3. 監聽時間/晝夜交替事件 (環境變化)
  let isNight = false;
  bot.on('time', () => {
    // 晝夜判斷邏輯：Minecraft 中 13000 到 23000 大約是晚上
    const currentNight = bot.time.timeOfDay >= 13000 && bot.time.timeOfDay <= 23000;
    if (currentNight !== isNight) {
      isNight = currentNight;
      const timeStatus = isNight 
        ? '夜晚降臨了，周圍變得昏暗，怪物可能會開始生成。' 
        : '太陽升起了，現在是白天，相對安全。';
      
      console.log(`[Mineflayer] Time changed: ${timeStatus}`);
      publishSensorEvent(
        eventBus,
        sessionId,
        embodiedAgentId,
        'system',
        `[環境變化] ${timeStatus}`
      );
    }
  });
}
