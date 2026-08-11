import { StateRegistry } from '../agent/StateRegistry';
import { IEventBus } from '../domain/IBus';

export interface CodeSkillContext<TEnv = any> {
    state: StateRegistry;
    eventBus: IEventBus;
    env: TEnv;
}

export abstract class BaseSkill<TEnv = any> {
    public abstract readonly name: string;
    public abstract readonly description: string;
    
    protected readonly state: StateRegistry;
    protected readonly eventBus: IEventBus;
    protected readonly env: TEnv;

    constructor(context: CodeSkillContext<TEnv>) {
        this.state = context.state;
        this.eventBus = context.eventBus;
        this.env = context.env;
    }

    public abstract execute(args?: any): Promise<any>;
}

export abstract class ActionSkill<TEnv = any> extends BaseSkill<TEnv> {
    /**
     * 行動技能改變環境狀態，執行完畢後必須回傳明確的成功/失敗描述
     */
    public abstract execute(args?: any): Promise<string>;
}

export abstract class ObservationSkill<TEnv = any> extends BaseSkill<TEnv> {
    private sensoryLoopTimer?: ReturnType<typeof setTimeout>;
    private isRunning = false;

    /**
     * 啟動背景感知迴圈，上一次執行完畢後等待指定毫秒才執行下一次
     */
    public startSensoryLoop(intervalMs: number): void {
        if (this.isRunning) return;
        this.isRunning = true;

        const loop = async () => {
            // 如果在此次迴圈開始前，已經被外部呼叫 stopSensoryLoop 停止，則直接中斷，避免殭屍迴圈
            if (!this.isRunning) return;
            try {
                await this.execute();
            } catch (err) {
                // 背景執行發生錯誤時的處理：目前僅印出日誌，未來可考慮發送至 EventBus 讓 Agent 決定是否修復
                console.error(`[SensoryLoop] Error in ${this.name}:`, err);
            } finally {
                // 確保在上一次 execute() 完全執行完畢（不論成功或失敗）後，才啟動下一個計時器。
                // 這樣可以避免當 execute() 的耗時大於 intervalMs 時，造成事件迴圈擁塞與 Promise 堆疊的效能瓶頸。
                if (this.isRunning) {
                    this.sensoryLoopTimer = setTimeout(loop, intervalMs);
                }
            }
        };

        this.sensoryLoopTimer = setTimeout(loop, intervalMs);
    }

    /**
     * 停止背景感知迴圈
     */
    public stopSensoryLoop(): void {
        this.isRunning = false;
        if (this.sensoryLoopTimer) {
            clearTimeout(this.sensoryLoopTimer);
            this.sensoryLoopTimer = undefined;
        }
    }
}
