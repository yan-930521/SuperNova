import { describe, expect, it, mock } from 'bun:test';

import { ConfigManager } from '../src';
import { Kernel } from '../src/kernel/Kernel';
import { IKernelPlugin, KernelState } from '../src/kernel/types';
import { ILifecycle } from '../src/lifecycle/ILifecycle';

describe('@supernova/runtime Kernel 合一生命週期測試', () => {
    it('應能正確管理服務註冊與查詢 (Service Registry)', () => {
        const kernel = new Kernel();
        expect(kernel.state).toBe(KernelState.INITIALIZING);

        const mockConfig = { appName: 'SuperNova' };
        kernel.registerService('config', mockConfig);

        expect(kernel.hasService('config')).toBe(true);
        expect(kernel.getService<typeof mockConfig>('config')).toBe(mockConfig);

        expect(() => kernel.getService('non_existent')).toThrow('Service [non_existent] is not registered in Kernel.');
    });

    it('IKernelPlugin extends ILifecycle：安裝與單一生命週期排程 (install -> initialize -> start -> stop)', async () => {
        const kernel = new Kernel();
        const callTrace: string[] = [];

        const testPlugin: IKernelPlugin = {
            name: 'demo_plugin',
            install: () => { callTrace.push('install'); },
            initialize: async () => { callTrace.push('initialize'); },
            start: async () => { callTrace.push('start'); },
            stop: async () => { callTrace.push('stop'); },
        };

        await kernel.use(testPlugin);
        expect(callTrace).toEqual(['install']);
        expect(kernel.hasService('demo_plugin')).toBe(true); // 自動註冊為服務

        await kernel.boot();
        expect(kernel.state).toBe(KernelState.RUNNING);
        expect(callTrace).toEqual(['install', 'initialize', 'start']);

        await kernel.stop();
        expect(kernel.state).toBe(KernelState.STOPPED);
        expect(callTrace).toEqual(['install', 'initialize', 'start', 'stop']);
    });

    it('關鍵驗證：當一個組件既是 IKernelPlugin 又被 registerService 時，絕對只會初始化一次與停止一次 (去重保護)', async () => {
        const kernel = new Kernel();
        let initCount = 0;
        let startCount = 0;
        let stopCount = 0;

        class DualIdentityComponent implements IKernelPlugin {
            public readonly name = 'dual_service';

            public async install(k: any): Promise<void> {
                // 在 install 內部將自己手動重複註冊進 services
                k.registerService('dual_service_alias', this);
            }

            public async initialize(): Promise<void> {
                initCount++;
            }

            public async start(): Promise<void> {
                startCount++;
            }

            public async stop(): Promise<void> {
                stopCount++;
            }
        }

        const comp = new DualIdentityComponent();

        // 1. 透過 use 掛載
        await kernel.use(comp);
        // 2. 外部又手動重複註冊一次
        kernel.registerService('dual_service', comp);

        await kernel.boot();

        // 必須精準等於 1，絕不能被呼叫兩次！
        expect(initCount).toBe(1);
        expect(startCount).toBe(1);

        await kernel.stop();

        // 停止也必須精準等於 1！
        expect(stopCount).toBe(1);
    });

    it('在 RUNNING 狀態下熱插拔 (Hot Plugin) 應立即觸發 initialize 與 start', async () => {
        const kernel = new Kernel();
        await kernel.boot();
        expect(kernel.state).toBe(KernelState.RUNNING);

        const callTrace: string[] = [];
        const hotPlugin: IKernelPlugin = {
            name: 'hot_plugin',
            install: () => { callTrace.push('install'); },
            initialize: async () => { callTrace.push('initialize'); },
            start: async () => { callTrace.push('start'); },
            stop: async () => { callTrace.push('stop'); },
        };

        await kernel.use(hotPlugin);
        expect(callTrace).toEqual(['install', 'initialize', 'start']);

        await kernel.stop();
        expect(callTrace).toEqual(['install', 'initialize', 'start', 'stop']);
    });

    it('逆序優雅停機：多個組件停止順序應與註冊順序嚴格相反', async () => {
        const kernel = new Kernel();
        const stopOrder: string[] = [];

        class ServiceA implements ILifecycle {
            public async initialize() {}
            public async start() {}
            public async stop() { stopOrder.push('A'); }
        }

        class ServiceB implements ILifecycle {
            public async initialize() {}
            public async start() {}
            public async stop() { stopOrder.push('B'); }
        }

        kernel.registerService('srvA', new ServiceA());
        kernel.registerService('srvB', new ServiceB());

        await kernel.boot();
        await kernel.stop();

        expect(stopOrder).toEqual(['B', 'A']);
    });

    it('心跳機制應能在每週期向 events 服務廣播 SYSTEM_TICK', async () => {
        const kernel = new Kernel({ tickIntervalMs: 50 });
        let tickCount = 0;

        const mockEventBus = {
            publish: (event: any) => {
                if (event.type === 'SYSTEM_TICK') {
                    tickCount++;
                }
            },
        };

        kernel.registerService('events', mockEventBus);
        await kernel.boot();

        await new Promise(resolve => setTimeout(resolve, 130));

        await kernel.stop();
        expect(tickCount).toBeGreaterThanOrEqual(2);
    });
});
