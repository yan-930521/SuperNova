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

    interface IEventBus {
        publish(eventType: string, payload: any): void;
    }

    interface CodeSkillContext<TEnv = any> {
        state: StateRegistry;
        eventBus: IEventBus;
        body: TEnv;
    }

    abstract class BaseSkill<TEnv = any> {
        public abstract readonly name: string;
        public abstract readonly description: string;
        protected readonly state: StateRegistry;
        protected readonly eventBus: IEventBus;
        protected readonly body: TEnv;
        constructor(context: CodeSkillContext<TEnv>);
        public abstract execute(args?: any): Promise<any>;
    }

    export abstract class ActionSkill<TEnv = any> extends BaseSkill<TEnv> {
        /**
         * 改變環境，回傳成功與否及詳細文字。
         */
        public abstract execute(args?: any): Promise<string>;
    }

    export abstract class ObservationSkill<TEnv = any> extends BaseSkill<TEnv> {
        /**
         * 啟動定時背景感知迴圈，每隔指定毫秒數執行一次 execute()。
         * 適合用於追蹤或是背景監控。
         */
        public startSensoryLoop(intervalMs: number): void;
        public stopSensoryLoop(): void;
    }
}
`;
