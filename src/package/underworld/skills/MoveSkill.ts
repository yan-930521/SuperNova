import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export interface MoveSkillArgs {
    /** 
     * 移動模式：
     * 'to' - 前往特定座標或實體
     * 'follow' - 持續跟隨實體
     */
    mode: 'to' | 'follow';
    
    /** 要前往或跟隨的目標名稱或實體 ID (可選) */
    target?: string;
    
    /** X 座標 (可選) */
    x?: number;
    
    /** Y 座標 (可選) */
    y?: number;
    
    /** Z 座標 (可選) */
    z?: number;
}

export default class MoveSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'MoveSkill';
    public readonly description = `移動到指定座標 (x, y, z)、實體位置，或持續跟隨實體。
當提供 x, y, z 時，將導航到該座標。
當提供 target 且 mode 為 'to' 時，將嘗試尋找實體進行導航。
當提供 target 且 mode 為 'follow' 時，將持續跟隨指定的實體。`;

    public async execute(args: MoveSkillArgs): Promise<string> {
        if (!args || !args.mode) {
            throw new Error('[Error] Insufficient parameters. "mode" (\'to\' or \'follow\') is required.');
        }

        const { mode, target, x, y, z } = args;

        // 寫入狀態，標記目前任務為 move
        this.state.update('currentTask', 'move');

        const findEntity = (targetNameOrId: string) => {
            const id = parseInt(targetNameOrId, 10);
            if (!isNaN(id) && this.env.core.entities[id]) {
                return this.env.core.entities[id];
            }
            return Object.values(this.env.core.entities).find((e: any) => 
                e.username === targetNameOrId || e.name === targetNameOrId || e.displayName === targetNameOrId
            );
        };

        try {
            if (mode === 'to') {
                if (x !== undefined && y !== undefined && z !== undefined) {
                    this.env.moveTo(x, y, z);
                    this.state.update('navigationTarget', { x, y, z });
                    return `[Move] Navigation target set to: (${x}, ${y}, ${z})`;
                }

                if (target !== undefined) {
                    const targetEntity = findEntity(target);
                    if (targetEntity) {
                        this.env.moveTo(targetEntity.position.x, targetEntity.position.y, targetEntity.position.z);
                        this.state.update('navigationTarget', { x: targetEntity.position.x, y: targetEntity.position.y, z: targetEntity.position.z });
                        return `[Move] Moving to entity ${targetEntity.username || targetEntity.name} at (${targetEntity.position.x.toFixed(1)}, ${targetEntity.position.y.toFixed(1)}, ${targetEntity.position.z.toFixed(1)})`;
                    }
                    throw new Error(`[Error] Cannot find player or entity named: ${target}`);
                }
                
                throw new Error(`[Error] Invalid "to" parameters. Must provide (x, y, z) or a target.`);
            }

            if (mode === 'follow') {
                if (target === undefined) {
                    throw new Error(`[Error] "follow" mode requires a "target" parameter.`);
                }
                const targetEntity = findEntity(target);

                if (!targetEntity) {
                    throw new Error(`[Error] Cannot find entity nearby with name or ID: ${target}`);
                }

                this.env.follow(targetEntity, 2);
                this.state.update('followingTarget', targetEntity.username || targetEntity.name);
                return `[Move] Following: ${targetEntity.username || targetEntity.name} [ID:${targetEntity.id}]`;
            }
            
            throw new Error(`[Error] Unknown move mode: ${mode}`);
            
        } catch (e: any) {
            throw new Error(`[Error] Move failed: ${e.message}`);
        }
    }
}
