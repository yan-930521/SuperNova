import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export interface LandmarkArgs {
    action: 'register' | 'query' | 'list' | 'delete';
    name?: string;
    description?: string;
    x?: number;
    y?: number;
    z?: number;
}

export default class LandmarkSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'landmark_skill';
    public readonly description = '管理語義化地名 (Landmarks)。可以將特定座標儲存到記憶體中，方便日後導航與尋路。';

    public async execute(args?: LandmarkArgs): Promise<string> {
        if (!args || !args.action) return '必須提供 action (register, query, list, delete)';

        // 從大腦讀取既有的 landmarks，若無則初始化為空物件
        const currentLandmarks = this.state.get('landmarks') || {};

        switch (args.action) {
            case 'register': {
                if (!args.name) return '註冊地標必須提供 name';
                
                // 如果沒有傳入座標，預設使用機器人當前位置
                let x = args.x;
                let y = args.y;
                let z = args.z;
                
                if (x === undefined || y === undefined || z === undefined) {
                    const pos = this.env.core.entity.position;
                    x = pos.x;
                    y = pos.y;
                    z = pos.z;
                }

                currentLandmarks[args.name] = {
                    x, y, z,
                    description: args.description || '無備註'
                };
                
                this.state.update('landmarks', currentLandmarks);
                return `已成功註冊地標 [${args.name}] 於座標 (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})。`;
            }

            case 'query': {
                if (!args.name) return '查詢地標必須提供 name';
                const loc = currentLandmarks[args.name];
                if (!loc) return `找不到名為 [${args.name}] 的地標。`;
                return `地標 [${args.name}] 的座標為 (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)})。備註: ${loc.description}`;
            }

            case 'list': {
                const keys = Object.keys(currentLandmarks);
                if (keys.length === 0) return '目前沒有儲存任何地標。';
                
                const listStr = keys.map(k => {
                    const loc = currentLandmarks[k];
                    return `- ${k}: (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)}) [${loc.description}]`;
                }).join('\n');
                
                return `已儲存的地標列表:\n${listStr}`;
            }

            case 'delete': {
                if (!args.name) return '刪除地標必須提供 name';
                if (!currentLandmarks[args.name]) return `找不到名為 [${args.name}] 的地標，無法刪除。`;
                
                delete currentLandmarks[args.name];
                this.state.update('landmarks', currentLandmarks);
                return `已成功刪除地標 [${args.name}]。`;
            }

            default:
                return `未知的 action: ${args.action}`;
        }
    }
}
