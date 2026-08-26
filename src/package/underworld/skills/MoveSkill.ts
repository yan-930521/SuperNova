import { ActionSkill } from '@core/skill/BaseSkill';
import { IBody } from '../../novalink/novalink-sdk/IBody';

export interface MoveSkillArgs {
    /** 
     * 移動模式：
     * 'to' - 前往特定座標
     * 'stop' - 停止移動
     */
    mode: 'to' | 'stop';
    
    /** X 座標 (可選) */
    x?: number;
    
    /** Y 座標 (可選) */
    y?: number;
    
    /** Z 座標 (可選) */
    z?: number;
}

export default class MoveSkill extends ActionSkill<IBody> {
    public readonly name = 'MoveSkill';
    public readonly description = `移動到指定座標 (x, y, z) 或停止移動。
當提供 x, y, z 且 mode 為 'to' 時，將導航到該座標。`;

    public async execute(args: MoveSkillArgs): Promise<string> {
        if (!args || !args.mode) {
            throw new Error('[Error] Insufficient parameters. "mode" (\'to\' or \'stop\') is required.');
        }

        const { mode, x, y, z } = args;
        this.state.update('currentTask', 'move');

        try {
            if (mode === 'to') {
                if (x !== undefined && y !== undefined && z !== undefined) {
                    await this.body.moveTo(x, y, z);
                    this.state.update('navigationTarget', { x, y, z });
                    return `[Move] Navigation target set to: (${x}, ${y}, ${z})`;
                }
                throw new Error(`[Error] Invalid "to" parameters. Must provide (x, y, z).`);
            }

            if (mode === 'stop') {
                await this.body.stopMove();
                this.state.update('navigationTarget', null);
                return `[Move] Stopped moving.`;
            }
            
            throw new Error(`[Error] Unknown move mode: ${mode}`);
            
        } catch (e: any) {
            throw new Error(`[Error] Move failed: ${e.message}`);
        }
    }
}

