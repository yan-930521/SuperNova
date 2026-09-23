import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';

import { ILifecycle } from '../lifecycle/ILifecycle';
import { IKernel, IKernelPlugin, KernelState } from './types';

/**
 * SuperNova 極簡微內核 (Universal Micro-Kernel Runtime)
 * 遵循「效率模組化至上」原則：
 * 1. 統一生命週期：IKernelPlugin extends ILifecycle，外掛即是系統服務
 * 2. 單一排程管線：實例層級嚴格去重，絕不重複執行初始化或停止
 * 3. 支援動態熱插拔與逆序優雅停機
 */
export class Kernel implements IKernel {
    initialize() {
        throw new Error('Method not implemented.');
    }
    start() {
        throw new Error('Method not implemented.');
    }
    /** 內核當前生命週期狀態 */
    private _state: KernelState = KernelState.INITIALIZING;

    /** 全域服務註冊表 (serviceName -> serviceInstance) */
    private readonly services = new Map<string, any>();

    /** 全域已安裝外掛對應表 (pluginName -> pluginInstance) */
    private readonly plugins = new Map<string, IKernelPlugin>();

    /** 受內核自動生命週期託管的服務隊列 */
    private readonly lifecycleQueue: { name: string; instance: ILifecycle }[] = [];

    /** 實例層級去重追蹤集合，防止同一個物件被重複註冊兩次 */
    private readonly trackedInstances = new Set<object>();

    /** 系統心跳定時器 */
    private tickTimer?: Timer | NodeJS.Timeout;

    /** 心跳頻率 (毫秒) */
    private readonly tickIntervalMs: number;

    /** 統一日誌記錄器 */
    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'Kernel' })
        .addTransport(new ConsoleTransport('DEBUG'));

    constructor(options?: { tickIntervalMs?: number }) {
        this.tickIntervalMs = options?.tickIntervalMs ?? 1000;
    }

    /** 取得目前內核運行狀態 */
    public get state(): KernelState {
        return this._state;
    }

    // ─── 服務容器 (Service Registry) ───

    /**
     * 註冊全局服務實例
     * 若服務實作了 ILifecycle，Kernel 將自動納入生命週期調度（具備去重保護）
     * @param name 服務名稱
     * @param service 服務物件實例
     */
    public registerService<T>(name: string, service: T): void {
        if (this.services.has(name)) {
            this.logger.warn(`Service [${name}] is already registered. Overwriting instance.`);
        } else {
            this.logger.info(`Registering service [${name}]`);
        }

        this.services.set(name, service);

        // 自動探測 ILifecycle 介面並加入調度隊列
        if (this.isLifecycle(service)) {
            this.enqueueLifecycle(name, service);
        }
    }

    /**
     * 取得已註冊的全局服務
     * @param name 服務名稱
     */
    public getService<T>(name: string): T {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service [${name}] is not registered in Kernel.`);
        }
        return service as T;
    }

    /**
     * 檢查特定服務是否已註冊
     */
    public hasService(name: string): boolean {
        return this.services.has(name);
    }

    // ─── 外掛體系 (Plugin System) ───

    /**
     * 掛載外掛至內核中
     * 1. 呼叫 plugin.install(kernel)
     * 2. 自動將外掛以其名稱註冊為全局服務
     * 3. 自動將外掛納入 ILifecycle 調度隊列（保證不重複初始化）
     * 4. 若內核正處於 RUNNING 狀態，自動進行熱插拔 (Hot Plugin) 初始化與啟動
     * @param plugin 外掛實例
     */
    public async use(plugin: IKernelPlugin): Promise<this> {
        if (this.plugins.has(plugin.name)) {
            this.logger.warn(`Plugin [${plugin.name}] is already loaded in Kernel.`);
            return this;
        }

        this.logger.info(`Installing plugin [${plugin.name}]...`);
        this.plugins.set(plugin.name, plugin);

        // 1. 注入內核上下文
        await plugin.install(this);

        // 2. 自動註冊為服務
        this.services.set(plugin.name, plugin);

        // 3. 納入生命週期隊列
        this.enqueueLifecycle(plugin.name, plugin);

        // 4. 若處於 RUNNING 狀態，支援動態熱插拔
        if (this._state === KernelState.RUNNING) {
            this.logger.info(`Hot-starting plugin [${plugin.name}]...`);
            await plugin.initialize();
            await plugin.start();
        }

        return this;
    }

    /** 檢查特定外掛是否已掛載 */
    public hasPlugin(name: string): boolean {
        return this.plugins.has(name);
    }

    /**
     * 將組件加入生命週期排程隊列（實例嚴格去重）
     */
    private enqueueLifecycle(name: string, instance: ILifecycle): void {
        if (typeof instance === 'object' && instance !== null) {
            if (this.trackedInstances.has(instance)) {
                this.logger.debug(`Instance for [${name}] is already in lifecycle queue. Skipping duplicate.`);
                return;
            }
            this.trackedInstances.add(instance);
        }

        this.logger.debug(`Enqueued [${name}] for automatic lifecycle management.`);
        this.lifecycleQueue.push({ name, instance });
    }

    // ─── 生命週期控管 (The Unified Lifecycle Pipeline) ───

    /**
     * 啟動內核
     * 依序對所有註冊的生命週期組件執行：全部 initialize() -> 全部 start()
     */
    public async boot(): Promise<void> {
        if (this._state === KernelState.RUNNING) {
            this.logger.warn('Kernel is already running.');
            return;
        }

        this.logger.info('Booting SuperNova Kernel...');
        this._state = KernelState.RUNNING;

        // 1. 初始化階段：依序對所有組件執行 initialize()
        for (const item of this.lifecycleQueue) {
            this.logger.debug(`Initializing component [${item.name}]...`);
            await item.instance.initialize();
        }

        // 2. 啟動階段：依序對所有組件執行 start()
        for (const item of this.lifecycleQueue) {
            this.logger.debug(`Starting component [${item.name}]...`);
            await item.instance.start();
        }

        // 3. 啟動心跳定時器
        this.startHeartbeat();

        this.logger.info('Kernel successfully booted into RUNNING state.');
    }

    /**
     * 啟動內部心跳引擎
     */
    private startHeartbeat(): void {
        this.tickTimer = setInterval(() => {
            if (this.hasService('events')) {
                try {
                    const eventBus = this.getService<any>('events');
                    if (typeof eventBus.publish === 'function') {
                        eventBus.publish({
                            type: 'SYSTEM_TICK',
                            timestamp: Date.now(),
                            payload: { timestamp: Date.now() },
                        });
                    }
                } catch {
                    // 心跳廣播防禦性容錯
                }
            }
        }, this.tickIntervalMs);
    }

    /**
     * 停止內核並逆序安全關閉所有組件 (stop)
     */
    public async stop(): Promise<void> {
        if (this._state === KernelState.STOPPED || this._state === KernelState.STOPPING) {
            return;
        }

        this.logger.info('Stopping SuperNova Kernel...');
        this._state = KernelState.STOPPING;

        // 1. 停止心跳定時器
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = undefined;
        }

        // 2. 逆序停止所有託管的生命週期組件
        const reversedLifecycles = [...this.lifecycleQueue].reverse();
        for (const item of reversedLifecycles) {
            try {
                this.logger.debug(`Stopping component [${item.name}]...`);
                await item.instance.stop();
            } catch (error) {
                this.logger.error(`Error stopping component [${item.name}]:`, { payload: { error } });
            }
        }

        this._state = KernelState.STOPPED;
        this.logger.info('SuperNova Kernel stopped successfully.');
    }

    /**
     * 嚴格檢查物件是否實作了完整的 ILifecycle 介面
     * 強制要求具備 initialize, start, stop 三個函式
     */
    private isLifecycle(obj: unknown): obj is ILifecycle {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            typeof (obj as any).initialize === 'function' &&
            typeof (obj as any).start === 'function' &&
            typeof (obj as any).stop === 'function'
        );
    }
}
