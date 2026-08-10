import { Bot } from 'mineflayer';
import { Entity } from 'prismarine-entity';
import { Block } from 'prismarine-block';

export class SuperNovaBot {
    public readonly core: Bot;

    constructor(bot: Bot) {
        this.core = bot;
    }

    // ==========================================
    // 1. 移動與尋路 (Pathfinder)
    // ==========================================
    public isMoving(): boolean {
        // @ts-ignore
        return this.core.pathfinder && this.core.pathfinder.isMoving();
    }

    public moveTo(x: number, y: number, z: number): void {
        try {
            // @ts-ignore
            if (this.core.pathfinder) {
                const { goals } = require('mineflayer-pathfinder');
                // @ts-ignore
                this.core.pathfinder.setGoal(new goals.GoalGetToBlock(x, y, z));
            }
        } catch (e) {
            console.error('[SuperNovaBot] Error in moveTo:', e);
        }
    }

    public follow(entity: Entity, range: number = 2): void {
        try {
            // @ts-ignore
            if (this.core.pathfinder) {
                const { goals } = require('mineflayer-pathfinder');
                // @ts-ignore
                this.core.pathfinder.setGoal(new goals.GoalFollow(entity, range), true);
            }
        } catch (e) {
            console.error('[SuperNovaBot] Error in follow:', e);
        }
    }

    public stopMoving(): void {
        try {
            // @ts-ignore
            if (this.core.pathfinder) {
                // @ts-ignore
                this.core.pathfinder.setGoal(null);
                // @ts-ignore
                if (this.core.pathfinder.isMoving()) {
                    // @ts-ignore
                    this.core.pathfinder.stop();
                }
            }
        } catch (e) {
            console.error('[SuperNovaBot] Error in stopMoving:', e);
        }
    }

    // ==========================================
    // 2. 對話系統 (Chat)
    // ==========================================
    public chat(message: string): void {
        try {
            this.core.chat(message);
        } catch (e) {
            console.error('[SuperNovaBot] Error in chat:', e);
        }
    }

    public whisper(player: string, message: string): void {
        try {
            this.core.whisper(player, message);
        } catch (e) {
            console.error('[SuperNovaBot] Error in whisper:', e);
        }
    }

    // ==========================================
    // 3. 戰鬥系統 (PvP & HawkEye)
    // ==========================================
    public isAttacking(): boolean {
        // @ts-ignore
        const pvpTarget = this.core.pvp && this.core.pvp.target;
        // @ts-ignore
        const hawkEyeTarget = this.core.hawkEye && this.core.hawkEye.target;
        return !!pvpTarget || !!hawkEyeTarget;
    }

    public stopCombat(): void {
        try {
            // @ts-ignore
            if (this.core.hawkEye) this.core.hawkEye.stop();
            // @ts-ignore
            if (this.core.pvp && this.core.pvp.target) this.core.pvp.stop();
        } catch (e) {
            console.error('[SuperNovaBot] Error in stopCombat:', e);
        }
    }

    public async attackTarget(target: Entity, preferWeapon: 'bow' | 'sword' = 'bow'): Promise<void> {
        if (!target) return;
        if (this.isAttacking()) return;

        if (preferWeapon === 'bow') {
            const bow = this.core.inventory.items().find(item => item.name.includes('bow'));
            if (bow) {
                await this.core.equip(bow, 'hand').catch(() => {});
                // @ts-ignore
                if (this.core.hawkEye) this.core.hawkEye.autoAttack(target, 'bow');
                return;
            }
        }

        // 近戰回退機制
        const sword = this.core.inventory.items().find(item => item.name.includes('sword'));
        if (sword) {
            await this.core.equip(sword, 'hand').catch(() => {});
        }
        // @ts-ignore
        if (this.core.pvp) this.core.pvp.attack(target);
    }

    // ==========================================
    // 3. 挖掘與方塊互動 (Tool & Mining)
    // ==========================================
    public async digBlock(block: Block, requireHarvest: boolean = true): Promise<void> {
        if (!block) return;
        try {
            // @ts-ignore
            if (this.core.tool) {
                // @ts-ignore
                await this.core.tool.equipForBlock(block, {
                    requireHarvest,
                    getFromChest: true,
                    maxTools: 3
                });
            }
        } catch (e) {
            console.error('[SuperNovaBot] Error equipping tool:', e);
        }
        await this.core.dig(block);
    }

    public stopDigging(): void {
        try {
            this.core.stopDigging();
        } catch (e) {
            console.error('[SuperNovaBot] Error in stopDigging:', e);
        }
    }

    // ==========================================
    // 4. 全局控制 (Global Controls)
    // ==========================================
    /**
     * 強制停止所有行為：尋路、挖掘、戰鬥，並清除控制鍵狀態
     */
    public stopAll(): void {
        this.stopMoving();
        this.stopDigging();
        this.stopCombat();
        this.core.clearControlStates();
    }
}
