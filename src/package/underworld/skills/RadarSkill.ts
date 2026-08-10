import { ObservationSkill } from '../../../core/skill/BaseSkill';
import { SuperNovaBot } from '../wrapper/SuperNovaBot';

export class RadarSkill extends ObservationSkill<SuperNovaBot> {
    public readonly name = 'RadarSkill';
    public readonly description = '背景雷達技能，掃描周遭實體（敵對生物、玩家、掉落物）並寫入狀態';

    public async execute(): Promise<void> {
        if (!this.env.core.entity) return;

        const botPos = this.env.core.entity.position;
        const radius = 20;

        const entities = Object.values(this.env.core.entities);
        const mobs: string[] = [];
        const players: string[] = [];
        const items: string[] = [];

        for (const entity of entities) {
            if (!entity || entity === this.env.core.entity) continue;
            if (!entity.position) continue;
            
            const distance = botPos.distanceTo(entity.position);
            if (distance > radius) continue;

            const name = entity.username || entity.name || 'Unknown';
            const info = `${name} (距離: ${distance.toFixed(1)})`;

            if (entity.type === 'player') {
                players.push(info);
            } else if (entity.type === 'mob') {
                mobs.push(info);
            } else if (entity.type === 'object' || entity.name === 'item') {
                items.push(info);
            }
        }

        const radarData = {
            players,
            mobs,
            items,
            lastScan: new Date().toISOString()
        };

        this.state.update('radar', radarData);
    }
}
