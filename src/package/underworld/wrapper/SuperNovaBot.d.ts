import { Bot } from 'mineflayer';
import { Entity } from 'prismarine-entity';
import { Block } from 'prismarine-block';

export interface SuperNovaBot {
    readonly core: Bot;
    isMoving(): boolean;
    moveTo(x: number, y: number, z: number): void;
    follow(entity: Entity, range?: number): void;
    stopMoving(): void;
    chat(message: string): void;
    whisper(player: string, message: string): void;
    isAttacking(): boolean;
    stopCombat(): void;
    attackTarget(target: Entity, preferWeapon?: 'bow' | 'sword'): Promise<void>;
    digBlock(block: Block, requireHarvest?: boolean): Promise<void>;
    stopDigging(): void;
    stopAll(): void;
}

// 覆寫 TEnv 的型別為 SuperNovaBot
export interface CodeSkillContext {
    env: SuperNovaBot;
}

export abstract class BaseSkill {
    protected readonly env: SuperNovaBot;
}
