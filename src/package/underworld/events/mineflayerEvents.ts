import hawkEye, { Weapons } from 'minecrafthawkeye';
import { Bot } from 'mineflayer';
import armorManager from 'mineflayer-armor-manager';
import { loader as autoEat } from 'mineflayer-auto-eat';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as tool } from 'mineflayer-tool';
import { mineflayer as mineflayerViewer } from 'prismarine-viewer';

import { messaging } from '../../../core';
import { SuperNovaBot } from '../wrapper/SuperNovaBot';
import { publishSensorEvent } from './helper';

export function setupMineflayerEvents(bot: Bot, eventBus: messaging.EventBus, sessionId: string, embodiedAgentId: string, mainAgentId: string) {
    bot.once('spawn', () => {
        bot.loadPlugin(pathfinder);
        bot.loadPlugin(armorManager);
        bot.loadPlugin(pvp);
        bot.loadPlugin(autoEat);
        bot.loadPlugin(tool);
        bot.loadPlugin(hawkEye);

        bot.autoEat.enableAuto();
        
        // 確保剛重生的時候穿上裝備
        setTimeout(() => {
            try {
                (bot as any).armorManager.equipAll();
            } catch (err) {
                console.error('Failed to equip armor on spawn:', err);
            }
        }, 1000);

        try {
            mineflayerViewer(bot, { port: 3007, firstPerson: false });
            console.log('[Viewer] 網頁視角伺服器已啟動！請在瀏覽器開啟 http://localhost:3007');
        } catch (e) {
            console.error('[Viewer] 啟動視角伺服器失敗:', e);
        }
    });

    bot.on('spawn', () => {
        const pos = bot.entity.position;
        const msg = `[環境感知: 重生]\n你感覺到肉體重組。\n- 位置: x:${pos.x.toFixed(1)}, y:${pos.y.toFixed(1)}, z:${pos.z.toFixed(1)}\n- 狀態: 血量 ${bot.health}/20 | 飢餓度 ${bot.food}/20\n(你需要重新確認裝備與背包狀況，並決定下一步)`;
        publishSensorEvent(
            eventBus, sessionId, embodiedAgentId, 'system',
            msg, 'SENSOR_INPUT', messaging.MessagePriority.LOW
        );
        publishSensorEvent(
            eventBus, sessionId, mainAgentId, 'system',
            msg, 'SENSOR_INPUT', messaging.MessagePriority.LOW
        );
    });

    bot.on('chat', (player, message) => {
        if (player === bot.username) return;
        console.log(`[Mineflayer] Chat [${player}]: ${message}`);
        
        // 透過 EventBus 將使用者的發言發送給 EmbodiedAgent (右腦)
        const block = new messaging.DataBlock({
            sessionId,
            senderId: player,
            targetId: embodiedAgentId,
            type: 'human',
            intent: 'SENSOR_INPUT',
            priority: messaging.MessagePriority.LOW,
            controlPayload: message
        });
        eventBus.publish({ type: messaging.AgentEvent.AgentMessage, timestamp: Date.now(), sessionId, payload: block });
    });

    let damageCooldown = false;
    let accumulatedDamage = 0;
    let lastHealth = 20;

    bot.on('health', () => {
        if (bot.health < lastHealth) {
            const damage = lastHealth - bot.health;
            lastHealth = bot.health;

            if (bot.health <= 0) return; // 由 death 事件處理

            // 自律神經本能：取消尋路與動作
            const snBot = new SuperNovaBot(bot);
            snBot.stopAll();

            // 自律神經本能：尋找並反擊最近的威脅
            const filter = (e: any) => (e.type === 'hostile' || e.type === 'mob' || e.type === 'player') && e.id !== bot.entity.id;
            const attacker = bot.nearestEntity((e) => {
                if (!filter(e)) return false;
                return bot.entity.position.distanceTo(e.position) < 6;
            });

            let reflexMsg = '';
            if (attacker) {
                // 自動換上最好的遠程/近戰武器
                const bow = bot.inventory.items().find(item => item.name.includes('bow'));
                if (bow) {
                    snBot.attackTarget(attacker, 'bow').catch(console.error);
                    reflexMsg = `\n⚠️ 肉體自律神經已觸發：自動中斷尋路，並向最近的威脅 (${attacker.name || attacker.displayName}) 使用 弓箭 反擊！`;
                } else {
                    snBot.attackTarget(attacker, 'sword').catch(console.error);
                    reflexMsg = `\n⚠️ 肉體自律神經已觸發：自動中斷尋路，並向最近的威脅 (${attacker.name || attacker.displayName}) 揮劍反擊！`;
                }
            } else {
                reflexMsg = `\n⚠️ 肉體自律神經已觸發：自動中斷動作 (未發現明確攻擊者，可能是環境傷害或遠程攻擊)。`;
            }

            if (!damageCooldown) {
                damageCooldown = true;
                accumulatedDamage = 0;

                publishSensorEvent(
                    eventBus, sessionId, embodiedAgentId, 'system',
                    `[身體警報: 受擊]\n你受到了傷害！失去 ${damage.toFixed(1)} 點血量。(剩餘血量: ${bot.health.toFixed(1)}/20)${reflexMsg}`,
                    'URGENT_ALERT',
                    messaging.MessagePriority.URGENT
                );
                publishSensorEvent(
                    eventBus, sessionId, mainAgentId, 'system',
                    `[身體警報: 受擊]\n你受到了傷害！失去 ${damage.toFixed(1)} 點血量。(剩餘血量: ${bot.health.toFixed(1)}/20)${reflexMsg}`,
                    'URGENT_ALERT',
                    messaging.MessagePriority.URGENT
                );

                setTimeout(() => {
                    damageCooldown = false;
                    if (accumulatedDamage > 0) {
                        publishSensorEvent(
                            eventBus, sessionId, embodiedAgentId, 'system',
                            `[身體警報: 持續受擊]\n在剛剛的 5 秒內，你持續受到傷害，額外失去 ${accumulatedDamage.toFixed(1)} 點血量。(目前剩餘血量: ${bot.health.toFixed(1)}/20)`,
                            'URGENT_ALERT',
                            messaging.MessagePriority.URGENT
                        );
                        publishSensorEvent(
                            eventBus, sessionId, mainAgentId, 'system',
                            `[身體警報: 持續受擊]\n在剛剛的 5 秒內，你持續受到傷害，額外失去 ${accumulatedDamage.toFixed(1)} 點血量。(目前剩餘血量: ${bot.health.toFixed(1)}/20)`,
                            'URGENT_ALERT',
                            messaging.MessagePriority.URGENT
                        );
                    }
                }, 5000);
            } else {
                accumulatedDamage += damage;
            }

        } else if (bot.health > lastHealth) {
            lastHealth = bot.health; // 處理自然回血
        }
    });

    bot.on('death', () => {
        console.log('[Mineflayer] Bot died.');
        const pos = bot.entity.position;
        const coords = pos ? `x:${pos.x.toFixed(1)}, y:${pos.y.toFixed(1)}, z:${pos.z.toFixed(1)}` : '未知';
        publishSensorEvent(
            eventBus, sessionId, embodiedAgentId, 'system',
            `[身體警報: 死亡]\n你已經死亡！。\n- 死前座標: ${coords}\n- 掉落裝備: 無`,
            'URGENT_ALERT',
            messaging.MessagePriority.URGENT
        );
        publishSensorEvent(
            eventBus, sessionId, mainAgentId, 'system',
            `[身體警報: 死亡]\n你已經死亡！。\n- 死前座標: ${coords}\n- 掉落裝備: 無`,
            'URGENT_ALERT',
            messaging.MessagePriority.URGENT
        );
        eventBus.publish({
            type: messaging.AgentEvent.EmotionTriggered,
            timestamp: Date.now(),
            sessionId: sessionId,
            payload: { impacts: { distress: 80, fear: 50, anxiety: 50 } }
        });
    });

    // 建立環境雷達 (Peripheral Nervous System)
    // 每 10 秒掃描一次周圍環境，並觸發 WorldUpdated 與 EmotionTriggered
    setInterval(() => {
        try {
            if (!bot.entity || !bot.entity.position) return;

            // 1. 組裝 WorldState 字串，並派發給 EmbodiedAgent 更新記憶
            const pos = bot.entity.position;
            const time = bot.time.timeOfDay;
            const timeStr = time < 13000 ? '白天' : '夜晚';
            const weatherStr = bot.isRaining ? '下雨/下雪' : '晴天';
            
            // 掃描附近實體 (16格內)
            const entities = Object.values(bot.entities)
                .filter(e => e !== bot.entity && e.position.distanceTo(bot.entity.position) <= 16)
                .filter(e => e.type === 'mob' || e.type === 'player' || e.type === 'hostile' || e.type === 'object');
            
            const entitiesStr = entities.length > 0 
                ? entities.map(e => `${e.name || '未知'} (距離: ${Math.round(e.position.distanceTo(bot.entity.position))}格)`).join(', ')
                : '無';

            const worldState = `【當前位置】 x:${pos.x.toFixed(1)}, y:${pos.y.toFixed(1)}, z:${pos.z.toFixed(1)}\n【環境】 時間: ${timeStr}, 天氣: ${weatherStr}\n【附近實體】 ${entitiesStr}`;

            eventBus.publish({
                type: messaging.AgentEvent.WorldUpdated,
                timestamp: Date.now(),
                sessionId: sessionId,
                payload: { agentId: embodiedAgentId, worldState }
            });
            eventBus.publish({
                type: messaging.AgentEvent.WorldUpdated,
                timestamp: Date.now(),
                sessionId: sessionId,
                payload: { agentId: mainAgentId, worldState }
            });

            // 2. 針對 MC 獨有的物理現象，觸發情緒衝擊給大腦 (MainAgent)
            let impacts: any = {};
            let hasImpact = false;

            const lowerState = worldState.toLowerCase();
            if (lowerState.includes('creeper') || lowerState.includes('zombie')) {
                impacts.anxiety = 45;
                impacts.fear = 30;
                hasImpact = true;
            }
            if (lowerState.includes('diamond')) {
                impacts.excitement = 50;
                impacts.joy = 30;
                hasImpact = true;
            }
            if (bot.health <= 6) {
                impacts.anxiety = (impacts.anxiety || 0) + 30;
                impacts.fear = (impacts.fear || 0) + 40;
                hasImpact = true;
            }
            if (bot.isRaining || (time > 13000 && time < 23000)) {
                impacts.anxiety = (impacts.anxiety || 0) + 10;
                impacts.energy = -5;
                hasImpact = true;
            }

            if (hasImpact) {
                eventBus.publish({
                    type: messaging.AgentEvent.EmotionTriggered,
                    timestamp: Date.now(),
                    sessionId: sessionId,
                    payload: { impacts }
                });
            }
        } catch (err) {
            console.error('[Mineflayer] Error in environment radar:', err);
        }
    }, 10000); // 10秒雷達掃描一次
}
