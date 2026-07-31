import { LogManager } from '../infra/LogManager';
import { GlobalEventMap, IDeclarativeSubscriber, IEvent, IEventBus } from './IBus';

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
 * 4. 宣告式訂閱 (Declarative Subscriber) 支持。
 */
export class EventBus implements IEventBus {
    private readonly logger = LogManager.recorder;
    private readonly callbackSubscribers = new Map<string, Set<ICallbackRegistration>>();
    private readonly declarativeSubscribers = new Map<string, Set<IDeclarativeSubscriber>>();

    /**
     * 發佈事件 (非同步廣播，不等待監聽器結束)
     */
    public publish<T extends Extract<keyof GlobalEventMap, string>>(event: IEvent<T>): void {
        const regs = this.getTargetCallbackRegistrations(event.type, event.sessionId);
        const decSubs = this.getTargetDeclarativeSubscribers(event.type, event.sessionId);

        // 觸發宣告式訂閱者的喚醒與訊息暫存 (TODO: 在後續協作流程中與控制面連動)
        if (decSubs.length > 0) {
            this.logger.debug(`[EventBus] Triggering wakeup for ${decSubs.length} declarative subscribers on event: ${event.type}`);
        }

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
        const decSubs = this.getTargetDeclarativeSubscribers(event.type, event.sessionId);

        if (decSubs.length > 0) {
            this.logger.debug(`[EventBus] Triggering wakeup for ${decSubs.length} declarative subscribers on event: ${event.type}`);
        }

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
     * 訂閱事件 (支持回標函數、通配符及宣告式訂閱)
     */
    public subscribe(
        type: string,
        handlerOrSubscriber: any,
        options?: { sessionId?: string }
    ): void {
        // 1. 宣告式訂閱
        if (handlerOrSubscriber && typeof handlerOrSubscriber === 'object' && 'agentId' in handlerOrSubscriber) {
            const sub = handlerOrSubscriber as IDeclarativeSubscriber;
            if (!this.declarativeSubscribers.has(type)) {
                this.declarativeSubscribers.set(type, new Set());
            }
            this.declarativeSubscribers.get(type)!.add(sub);
            this.logger.info(`[EventBus] Declarative subscriber registered: Session ${sub.sessionId}, Agent ${sub.agentId} to: ${type}`);
            return;
        }

        // 2. 回調函數與通配符訂閱
        const handler = handlerOrSubscriber as (event: IEvent<any>) => void;
        if (!this.callbackSubscribers.has(type)) {
            this.callbackSubscribers.set(type, new Set());
        }

        this.callbackSubscribers.get(type)!.add({
            handler,
            sessionId: options?.sessionId
        });
        this.logger.debug(`[EventBus] Callback subscribed to: ${type}${options?.sessionId ? ` (Session: ${options.sessionId})` : ''}`, { type: 'SYSTEM' });
    }

    /**
     * 取消訂閱
     */
    public unsubscribe(
        type: string,
        handlerOrSubscriber: any
    ): void {
        // 1. 宣告式訂閱取消
        if (handlerOrSubscriber && typeof handlerOrSubscriber === 'object' && 'agentId' in handlerOrSubscriber) {
            const sub = handlerOrSubscriber as IDeclarativeSubscriber;
            const subs = this.declarativeSubscribers.get(type);
            if (subs) {
                for (const item of subs) {
                    if (item.sessionId === sub.sessionId && item.agentId === sub.agentId) {
                        subs.delete(item);
                        break;
                    }
                }
                if (subs.size === 0) {
                    this.declarativeSubscribers.delete(type);
                }
                this.logger.info(`[EventBus] Declarative subscriber removed: Session ${sub.sessionId}, Agent ${sub.agentId} from: ${type}`);
            }
            return;
        }

        // 2. 回調式訂閱取消
        const handler = handlerOrSubscriber as (event: IEvent<any>) => void;
        const regs = this.callbackSubscribers.get(type);
        if (regs) {
            for (const reg of regs) {
                if (reg.handler === handler) {
                    regs.delete(reg);
                    break;
                }
            }
            if (regs.size === 0) {
                this.callbackSubscribers.delete(type);
            }
            this.logger.info(`[EventBus] Callback unsubscribed from: ${type}`, { type: 'SYSTEM' });
        }
    }

    // --- 內部輔助過濾方法 ---

    /**
     * 獲取匹配的 callback 監聽器，實施 sessionId 隔離過濾
     */
    private getTargetCallbackRegistrations(eventType: string, eventSessionId?: string): ICallbackRegistration[] {
        const specific = this.callbackSubscribers.get(eventType) || new Set();
        const wildcard = this.callbackSubscribers.get('*') || new Set();

        const all = new Set([...specific, ...wildcard]);
        const matched: ICallbackRegistration[] = [];

        for (const reg of all) {
            // 隔離規則：
            // 1. 若事件限定了 sessionId：監聽器必須是同一個 sessionId，或是全局監聽器 (無 sessionId)
            // 2. 若事件未限定 sessionId (全局公共事件)：派發給所有監聽器
            if (eventSessionId) {
                if (!reg.sessionId || reg.sessionId === eventSessionId) {
                    matched.push(reg);
                }
            } else {
                matched.push(reg);
            }
        }
        return matched;
    }

    /**
     * 獲取匹配的宣告式訂閱者，實施 sessionId 隔離過濾
     */
    private getTargetDeclarativeSubscribers(eventType: string, eventSessionId?: string): IDeclarativeSubscriber[] {
        const specific = this.declarativeSubscribers.get(eventType) || new Set();
        const matched: IDeclarativeSubscriber[] = [];

        for (const sub of specific) {
            if (eventSessionId) {
                if (sub.sessionId === eventSessionId) {
                    matched.push(sub);
                }
            } else {
                matched.push(sub);
            }
        }
        return matched;
    }
}
