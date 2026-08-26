import { ActionSkill } from '@core/skill/BaseSkill';
import { IBody } from '../../novalink/novalink-sdk/IBody';

export interface ObserveArgs {
    target: 'self' | 'env' | 'scan' | 'inspect' | 'look';
    block_name?: string;
    radius?: number;
    entity_id?: string;
    x?: number;
    y?: number;
    z?: number;
}

export default class ObserveSkill extends ActionSkill<IBody> {
    public readonly name = 'observe';
    public readonly description = '獲取自身狀態、環境狀態，或將視線轉向特定座標並回報眼前方塊。';

    public async execute(args?: ObserveArgs): Promise<string> {
        const target = args?.target?.toLowerCase() || 'self';
        
        if (target === 'self') {
            const status = await this.body.getStatus();
            const equip = await this.body.getEquipment();
            
            this.state.update('selfPosition', { x: status.pos[0], y: status.pos[1], z: status.pos[2] });
            this.state.update('selfHealth', status.hp);

            const equipStr = Object.entries(equip).map(([k, v]) => `${k}: ${v}`).join(', ');
            return `[Observe Self]\n位置: (${status.pos[0].toFixed(1)}, ${status.pos[1].toFixed(1)}, ${status.pos[2].toFixed(1)})\n血量: ${status.hp}\n【裝備】\n${equipStr}`;
        } 
        
        if (target === 'env') {
            const entities = await this.body.getNearbyEntities(16);
            const entitiesStr = entities.length > 0 ? entities.map(e => `${e.type} (距離: ${e.distance.toFixed(1)})`).join('\n- ') : '無';
            const blockHit = await this.body.rayTraceBlocks(5);
            const blockStr = blockHit.type !== 'miss' && blockHit.pos ? `${blockHit.block} (${blockHit.pos[0]}, ${blockHit.pos[1]}, ${blockHit.pos[2]})` : '無';

            return `[Observe Env]\n【視線所及】 ${blockStr}\n【實體 (16格)】\n- ${entitiesStr}`;
        }

        if (target === 'look') {
            const { x, y, z } = args || {};
            if (x === undefined || y === undefined || z === undefined) throw new Error('[Error] 請提供 x, y, z 座標');

            await this.body.lookAt(x, y, z);
            const blockHit = await this.body.rayTraceBlocks(10);
            const blockStr = blockHit.type !== 'miss' && blockHit.pos ? `${blockHit.block} (x:${blockHit.pos[0]}, y:${blockHit.pos[1]}, z:${blockHit.pos[2]})` : '無';
            return `[Look] 已轉向座標 (${x}, ${y}, ${z})。\n視線所及方塊: ${blockStr}`;
        }

        if (target === 'scan' || target === 'inspect') {
            return `[Error] NovaLink 暫不支援 ${target} 操作，請等待底層 RPC 實作。`;
        }

        throw new Error(`[Error] 未知的觀察目標: ${target}。`);
    }
}