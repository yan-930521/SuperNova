import { IEventBus } from '../domain/IBus';
import { StateRegistry } from '../agent/StateRegistry';
// BotManager is from underworld, but since we are in core, we use any or generic. 
// We will use an interface so we don't have to couple core with underworld.
export interface IBotContext {
    executeCommand(command: string): Promise<string>;
    [key: string]: any;
}

export interface CodeSkillContext {
    state: StateRegistry;
    eventBus: IEventBus;
    bot: IBotContext;
}

export abstract class BaseSkill {
    public abstract readonly name: string;
    public abstract readonly description: string;
    
    protected readonly state: StateRegistry;
    protected readonly eventBus: IEventBus;
    protected readonly bot: IBotContext;

    constructor(context: CodeSkillContext) {
        this.state = context.state;
        this.eventBus = context.eventBus;
        this.bot = context.bot;
    }

    public abstract execute(args?: any): Promise<any>;
}

export abstract class ActionSkill extends BaseSkill {
    /**
     * 行動技能改變環境狀態，執行完畢後必須回傳明確的成功/失敗描述
     */
    public abstract execute(args?: any): Promise<string>;
}

export abstract class ObservationSkill extends BaseSkill {
    private sensoryLoopTimer?: ReturnType<typeof setInterval>;

    /**
     * 啟動背景感知迴圈，每隔指定毫秒執行一次 `execute`
     */
    public startSensoryLoop(intervalMs: number): void {
        if (this.sensoryLoopTimer) return;
        this.sensoryLoopTimer = setInterval(async () => {
            try {
                await this.execute();
            } catch (err) {
                // Background error handling, can be piped to EventBus
                console.error(`[SensoryLoop] Error in ${this.name}:`, err);
            }
        }, intervalMs);
    }

    /**
     * 停止背景感知迴圈
     */
    public stopSensoryLoop(): void {
        if (this.sensoryLoopTimer) {
            clearInterval(this.sensoryLoopTimer);
            this.sensoryLoopTimer = undefined;
        }
    }
}
