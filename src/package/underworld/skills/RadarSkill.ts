import { ObservationSkill } from '../../../core/skill/BaseSkill';
import { IBody } from '../../novalink/novalink-sdk/IBody';

export class RadarSkill extends ObservationSkill<IBody> {
    public readonly name = 'RadarSkill';
    public readonly description = '背景雷達技能，掃描周遭實體並寫入狀態';

    public async execute(): Promise<void> {
        const entities = await this.body.getNearbyEntities(20);
        const mobs: string[] = [];
        const players: string[] = [];
        const items: string[] = [];

        for (const entity of entities) {
            const info = `${entity.type} (距離: ${entity.distance.toFixed(1)})`;
            if (entity.type === 'minecraft:player') players.push(info);
            else if (entity.type.includes('minecraft:item')) items.push(info);
            else mobs.push(info);
        }

        this.state.update('radar', { players, mobs, items, lastScan: new Date().toISOString() });
    }
}