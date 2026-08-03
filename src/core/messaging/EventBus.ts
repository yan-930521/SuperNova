import { LogManager } from '../infra/LogManager';
import { GlobalEventMap, IEvent, IEventBus } from './IBus';
import { LRUCache } from '../utils/LRUCache';
import { DEFAULT_CONFIG } from '../config/DefaultConfig';

interface ICallbackRegistration {
    handler: (event: IEvent<any>) => void | Promise<void>;
    sessionId?: string;
}

/**
 * EventBus
 * 負責全局事件的發布與訂閱管理。
 * 增強版支持：
 * 1. 異步監聽 Promise 健壯性防禦與全域 Unhandled Rejection 阻斷。
 * 2. 異步等待分發 (publishAsync)。
 * 3. 基於 sessionId 的租戶安全隔離路由。
 */
export class EventBus implements IEventBus {
    private readonly logger = LogManager.recorder;
    private readonly callbackSubscribers = new Map<string, Set<ICallbackRegistration>>();
    private readonly handlerIndex = new Map<Function, { type: string; reg: ICallbackRegistration }>();
    private readonly targetCache: LRUCache<string, ICallbackRegistration[]>;

    constructor(config?: any) {
        const lruSize = config?.cache?.event_bus_lru_size ?? DEFAULT_CONFIG.cache.event_bus_lru_size ?? 500;
        this.targetCache = new LRUCache<string, ICallbackRegistration[]>(lruSize);
    }

    /**
     * 發佈事件 (非同步廣播，不等待監聽器結束)
     */
    public publish<T extends Extract<keyof GlobalEventMap, string>>(event: IEvent<T>): void {
        const regs = this.getTargetCallbackRegistrations(event.type, event.sessionId);
        if (regs.length === 0) return;

        setImmediate(() => {
            this.logger.debug(`[EventBus] Publishing event: ${event.type} to ${regs.length} callback subscribers`, { type: 'SYSTEM' });

            regs.forEach(reg => {
                try {
                    const result = reg.handler(event);
                    // 對於異步 Promise，防禦性捕獲其錯誤，防止異步 reject 造成全域進程崩潰
                    if (result instanceof Promise) {
                        result.catch(error => {
                            this.logger.error(`[EventBus] Async subscriber failed for event: ${event.type}`, {
                                type: 'SYSTEM',
                                payload: { error: error instanceof Error ? error.message : String(error) }
                            });
                        });
                    }
                } catch (error) {
                    // 捕獲同步錯誤
                    this.logger.error(`[EventBus] Sync subscriber failed for event: ${event.type}`, {
                        type: 'SYSTEM',
                        payload: { error: error instanceof Error ? error.message : String(error) }
                    });
                }
            });
        });
    }

    /**
     * 發佈事件並追蹤所有監聽器 (等待所有同步/異步 Handler 執行完畢，確保因果鏈同步)
     */
    public async publishAsync<T extends Extract<keyof GlobalEventMap, string>>(event: IEvent<T>): Promise<PromiseSettledResult<any>[]> {
        const regs = this.getTargetCallbackRegistrations(event.type, event.sessionId);
        if (regs.length === 0) return [];

        this.logger.debug(`[EventBus] Async publishing event: ${event.type} to ${regs.length} callback subscribers`, { type: 'SYSTEM' });

        const promises = regs.map(async (reg) => {
            try {
                return await reg.handler(event);
            } catch (error: any) {
                this.logger.error(`[EventBus] Subscriber failed in publishAsync for event: ${event.type}`, {
                    type: 'SYSTEM',
                    payload: { error: error.message }
                });
                throw error;
            }
        });

        const results = await Promise.allSettled(promises);
        const rejected = results.find(r => r.status === 'rejected');
        if (rejected) {
            throw (rejected as PromiseRejectedResult).reason;
        }
        return results;
    }

    /**
     * 訂閱事件 (支持回標函數及通配符)
     */
    public subscribe(
        type: string,
        handler: (event: IEvent<any>) => void | Promise<void>,
        options?: { sessionId?: string }
    ): void {
        if (!this.callbackSubscribers.has(type)) {
            this.callbackSubscribers.set(type, new Set());
        }

        const reg: ICallbackRegistration = { handler, sessionId: options?.sessionId };
        this.callbackSubscribers.get(type)!.add(reg);
        this.handlerIndex.set(handler, { type, reg });
        this.targetCache.clear(); // 訂閱異動時清空快取
        this.logger.debug(`[EventBus] Callback subscribed to: ${type}${options?.sessionId ? ` (Session: ${options.sessionId})` : ''}`, { type: 'SYSTEM' });
    }

    /**
     * 取消訂閱
     */
    public unsubscribe(
        type: string,
        handler: (event: IEvent<any>) => void | Promise<void>
    ): void {
        const entry = this.handlerIndex.get(handler);
        if (entry) {
            const regs = this.callbackSubscribers.get(entry.type);
            if (regs) {
                regs.delete(entry.reg);
                if (regs.size === 0) this.callbackSubscribers.delete(entry.type);
            }
            this.handlerIndex.delete(handler);
            this.targetCache.clear(); // 訂閱異動時清空快取
            this.logger.info(`[EventBus] Callback unsubscribed from: ${type}`, { type: 'SYSTEM' });
        }
    }

    // --- 內部輔助過濾方法 ---

    /**
     * 獲取匹配的 callback 監聽器，實施 sessionId 隔離過濾
     */
    private getTargetCallbackRegistrations(eventType: string, eventSessionId?: string): ICallbackRegistration[] {
        const cacheKey = `${eventType}:${eventSessionId || ''}`;
        const cached = this.targetCache.get(cacheKey);
        if (cached) return cached;

        const specific = this.callbackSubscribers.get(eventType);
        const wildcard = this.callbackSubscribers.get('*');

        if (!specific && !wildcard) {
            this.targetCache.set(cacheKey, []);
            return [];
        }

        const source = (!wildcard) ? specific!
                     : (!specific) ? wildcard!
                     : null;

        if (source) {
            const matched: ICallbackRegistration[] = [];
            for (const reg of source) {
                if (!eventSessionId || !reg.sessionId || reg.sessionId === eventSessionId) {
                    matched.push(reg);
                }
            }
            this.targetCache.set(cacheKey, matched);
            return matched;
        }

        const matched: ICallbackRegistration[] = [];
        const seen = new Set<ICallbackRegistration>();
        for (const reg of specific!) {
            if (!eventSessionId || !reg.sessionId || reg.sessionId === eventSessionId) {
                matched.push(reg);
                seen.add(reg);
            }
        }
        for (const reg of wildcard!) {
            if (!seen.has(reg) && (!eventSessionId || !reg.sessionId || reg.sessionId === eventSessionId)) {
                matched.push(reg);
            }
        }
        
        this.targetCache.set(cacheKey, matched);
        return matched;
    }
}
