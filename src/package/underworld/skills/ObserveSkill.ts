import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export interface ObserveArgs {
    target: 'self' | 'env' | 'scan' | 'inspect' | 'look';
    block_name?: string;
    radius?: number;
    entity_id?: number;
    x?: number;
    y?: number;
    z?: number;
}

export default class ObserveSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'observe';
    public readonly description = '獲取自身狀態、環境狀態，或是掃描周圍特定方塊、深度查看某個實體的詳細資料、將視線轉向特定座標並回報眼前方塊。';

    public async execute(args?: ObserveArgs): Promise<string> {
        // 如果沒有提供參數，預設觀察自我 (用於背景輪詢)
        const target = args?.target?.toLowerCase() || 'self';
        const rawBot = this.env.core;
        
        if (target === 'self') {
            const health = rawBot.health;
            const food = rawBot.food;
            const pos = rawBot.entity.position;
            const items = rawBot.inventory.items().map(i => `${i.name} x${i.count}`);
            
            const equipment = {
                hand: rawBot.inventory.slots[rawBot.getEquipmentDestSlot('hand')]?.name || '無',
                offhand: rawBot.inventory.slots[rawBot.getEquipmentDestSlot('off-hand')]?.name || '無',
                head: rawBot.inventory.slots[rawBot.getEquipmentDestSlot('head')]?.name || '無',
                torso: rawBot.inventory.slots[rawBot.getEquipmentDestSlot('torso')]?.name || '無',
                legs: rawBot.inventory.slots[rawBot.getEquipmentDestSlot('legs')]?.name || '無',
                feet: rawBot.inventory.slots[rawBot.getEquipmentDestSlot('feet')]?.name || '無',
            };

            const equipStr = `右手: ${equipment.hand}, 左手: ${equipment.offhand}\n防具: [頭: ${equipment.head}, 胸: ${equipment.torso}, 腿: ${equipment.legs}, 腳: ${equipment.feet}]`;
            const inventoryStr = items.length > 0 ? items.join(', ') : '空';
            const posStr = `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;

            // 將觀察到的狀態寫入狀態註冊表
            this.state.update('selfPosition', { x: pos.x, y: pos.y, z: pos.z });
            this.state.update('selfHealth', health);
            this.state.update('selfFood', food);

            return `[Observe Self]\n位置: ${posStr}\n血量: ${health}/20, 飽食度: ${food}/20\n【裝備】\n${equipStr}\n【背包】\n${inventoryStr}`;
        } 
        
        if (target === 'env') {
            const pos = rawBot.entity.position;
            const posStr = `x: ${pos.x.toFixed(1)}, y: ${pos.y.toFixed(1)}, z: ${pos.z.toFixed(1)}`;
            const time = rawBot.time.timeOfDay;
            const timeStr = time < 13000 ? '白天' : '夜晚';
            const weatherStr = rawBot.isRaining ? '下雨/下雪' : '晴天';
            
            const botYaw = rawBot.entity.yaw;
            const getRelDir = (tx: number, tz: number) => {
                const dx = tx - pos.x;
                const dz = tz - pos.z;
                const targetYaw = Math.atan2(-dx, -dz);
                let diff = (targetYaw - botYaw) % (2 * Math.PI);
                if (diff < -Math.PI) diff += 2 * Math.PI;
                if (diff > Math.PI) diff -= 2 * Math.PI;
                const deg = diff * 180 / Math.PI;
                
                if (deg > -22.5 && deg <= 22.5) return '正前方';
                if (deg > 22.5 && deg <= 67.5) return '右前方';
                if (deg > 67.5 && deg <= 112.5) return '正右方';
                if (deg > 112.5 && deg <= 157.5) return '右後方';
                if (deg > 157.5 || deg <= -157.5) return '正後方';
                if (deg > -157.5 && deg <= -112.5) return '左後方';
                if (deg > -112.5 && deg <= -67.5) return '正左方';
                if (deg > -67.5 && deg <= -22.5) return '左前方';
                return '未知';
            };

            const entities = Object.values(rawBot.entities)
                .filter(e => e !== rawBot.entity && e.position.distanceTo(rawBot.entity.position) <= 16)
                .map(e => {
                    const dist = Math.round(e.position.distanceTo(rawBot.entity.position));
                    const dir = getRelDir(e.position.x, e.position.z);
                    return `${e.name || e.username || '未知'} [ID: ${e.id}] (距離: ${dist}格, ${dir})`;
                });
            const entitiesStr = entities.length > 0 ? entities.join('\n- ') : '無';

            const block = rawBot.blockAtCursor(5);
            const blockStr = block && block.name !== 'air' ? `${block.name} (座標: ${block.position.x}, ${block.position.y}, ${block.position.z})` : '無 (或距離過遠)';

            const poiNames = ['crafting_table', 'furnace', 'chest', 'diamond_ore', 'iron_ore', 'coal_ore', 'gold_ore', 'lava', 'fire', 'wheat'];
            const poiFound: string[] = [];
            
            try {
                // @ts-ignore
                const poiIds = poiNames.map(name => rawBot.registry.blocksByName[name]?.id).filter(id => id !== undefined);
                if (poiIds.length > 0) {
                    const blocks = rawBot.findBlocks({ matching: poiIds, maxDistance: 10, count: 20 });
                    const grouped: Record<string, number> = {};
                    blocks.forEach(bPos => {
                        const b = rawBot.blockAt(bPos);
                        if (b) {
                            grouped[b.name] = (grouped[b.name] || 0) + 1;
                        }
                    });
                    Object.entries(grouped).forEach(([name, count]) => {
                        poiFound.push(`${name} x${count}`);
                    });
                }
            } catch (e) {}
            const poiStr = poiFound.length > 0 ? poiFound.join(', ') : '無';

            this.state.update('environment', { time: timeStr, weather: weatherStr, pois: poiFound });

            return `[Observe Env]\n【位置】 ${posStr}\n【環境】 時間: ${timeStr} (${time}), 天氣: ${weatherStr}\n【視線所及】 ${blockStr}\n【實體 (16格)】\n- ${entitiesStr}\n【高價值雷達 (10格內)】: ${poiStr}`;
        }

        if (target === 'scan') {
            const blockName = args?.block_name;
            if (!blockName) throw new Error('[Error] 請提供要掃描的方塊名稱 (block_name)');
            
            const radius = args?.radius ?? 16;
            const pos = rawBot.entity.position;
            const foundBlocks: string[] = [];
            
            try {
                // @ts-ignore
                const matchingIds = rawBot.registry.blocksByName[blockName.toLowerCase()]?.id;
                if (matchingIds !== undefined) {
                    const blocks = rawBot.findBlocks({ matching: matchingIds, maxDistance: radius, count: 10 });
                    blocks.forEach(bPos => {
                        const dist = Math.round(pos.distanceTo(bPos));
                        foundBlocks.push(`x:${bPos.x}, y:${bPos.y}, z:${bPos.z} (距離: ${dist}格)`);
                    });
                }
            } catch (e) {}

            return foundBlocks.length > 0 
                ? `[Scan] 在 ${radius} 格內發現 ${blockName}:\n- ${foundBlocks.join('\n- ')}` 
                : `[Scan] 在 ${radius} 格內未發現 ${blockName}。`;
        }

        if (target === 'inspect') {
            const entityId = args?.entity_id;
            if (entityId === undefined || isNaN(entityId)) throw new Error('[Error] 請提供實體 ID (entity_id)');
            
            const entity = rawBot.entities[entityId];
            if (!entity) throw new Error(`[Error] 找不到 ID 為 ${entityId} 的實體，可能已死亡或距離過遠。`);

            const dist = Math.round(rawBot.entity.position.distanceTo(entity.position));
            const equip = entity.equipment ? entity.equipment.map(i => i ? i.name : '無').join(', ') : '未知';
            
            return `[Inspect] ${entity.name || entity.username}\nID: ${entity.id}\n位置: x:${entity.position.x.toFixed(1)}, y:${entity.position.y.toFixed(1)}, z:${entity.position.z.toFixed(1)} (距離: ${dist}格)\n類型: ${entity.type}\n裝備: ${equip}\n血量: ${entity.metadata[1] || '未知'}`;
        }

        if (target === 'look') {
            const { x, y, z } = args || {};
            if (x === undefined || y === undefined || z === undefined) {
                throw new Error('[Error] 請提供 x, y, z 座標');
            }

            try {
                const Vec3 = require('vec3');
                await rawBot.lookAt(new Vec3(x, y, z));
                const block = rawBot.blockAtCursor(10);
                const blockStr = block && block.name !== 'air' ? `${block.name} (x:${block.position.x}, y:${block.position.y}, z:${block.position.z})` : '無';
                return `[Look] 已轉向座標 (${x}, ${y}, ${z})。\n視線所及方塊: ${blockStr}`;
            } catch (e: any) {
                throw new Error(`[Error] 轉向失敗: ${e.message}`);
            }
        }

        throw new Error(`[Error] 未知的觀察目標: ${target}。支援的目標有: self, env, scan, inspect, look`);
    }
}
