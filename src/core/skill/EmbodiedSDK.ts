export const EMBODIED_SDK_DECLARATION = `
declare module "supernova-embodied-sdk" {

    /**
     * 動態狀態註冊表
     * 讓你能儲存、讀取與更新你的記憶狀態。
     */
    interface StateRegistry {
        register<T>(key: string, initialValue: T, description: string): void;
        get<T>(key: string): T | undefined;
        update<T>(key: string, newValue: T): void;
        delete(key: string): void;
        exportSummary(): string;
    }

    /**
     * Minecraft 環境控制器
     */
    interface IBotContext {
        /**
         * 執行任何 underworld CLI 指令。
         * 例如: executeCommand('nav to 100 64 200') 或 executeCommand('mine start here')
         */
        executeCommand(command: string): Promise<string>;
    }

    interface CodeSkillContext {
        state: StateRegistry;
        bot: IBotContext;
    }

    abstract class BaseSkill {
        public abstract readonly name: string;
        public abstract readonly description: string;
        protected readonly state: StateRegistry;
        protected readonly bot: IBotContext;
        constructor(context: CodeSkillContext);
        public abstract execute(args?: any): Promise<any>;
    }

    export abstract class ActionSkill extends BaseSkill {
        /**
         * 改變環境，回傳成功與否及詳細文字。
         */
        public abstract execute(args?: any): Promise<string>;
    }

    export abstract class ObservationSkill extends BaseSkill {
        /**
         * 啟動定時背景感知迴圈，每隔指定毫秒數執行一次 execute()。
         * 適合用於追蹤附近的敵人或監控狀態。
         */
        public startSensoryLoop(intervalMs: number): void;
        public stopSensoryLoop(): void;
    }
}
`;
