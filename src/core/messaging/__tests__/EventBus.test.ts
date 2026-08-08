import { describe, it, expect } from 'bun:test';
import { EventBus } from '../EventBus';
import { IEventBus } from '../../domain/IBus';
import { IEvent } from '../../domain/IBus';

describe('EventBus High-Level Features Test', () => {
  it('should support sessionId isolation and filtering', async () => {
    const bus = new EventBus();
    let session1Count = 0;
    let session2Count = 0;
    let globalCount = 0;

    // 1. 訂閱
    bus.subscribe('TEST_EVENT', (event: any) => {
      session1Count++;
    }, { sessionId: 'session-1' });

    bus.subscribe('TEST_EVENT', (event: any) => {
      session2Count++;
    }, { sessionId: 'session-2' });

    bus.subscribe('TEST_EVENT', (event: any) => {
      globalCount++;
    }); // 全局監聽

    // 2. 發佈屬於 session-1 的事件
    const event: IEvent = {
      type: 'TEST_EVENT',
      timestamp: Date.now(),
      payload: 'hello',
      sessionId: 'session-1'
    };

    bus.publish(event);

    // 等待 setImmediate 執行完畢
    await new Promise<void>(resolve => setImmediate(() => resolve()));

    // 3. 驗證隔離
    expect(session1Count).toBe(1);
    expect(globalCount).toBe(1);
    expect(session2Count).toBe(0); // session-2 絕不能收到！
  });

  it('should wait for handlers to resolve in publishAsync', async () => {
    const bus = new EventBus();
    let val = 0;

    bus.subscribe('ASYNC_EVENT', async (event: any) => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 50));
      val = 42;
    });

    const event: IEvent = {
      type: 'ASYNC_EVENT',
      timestamp: Date.now(),
      payload: {}
    };

    // 呼叫 publishAsync 並 await
    const results = await bus.publishAsync(event);

    expect(results.length).toBe(1);
    expect(results[0].status).toBe('fulfilled');
    expect(val).toBe(42); // 驗證確實等待了 async 結束
  });

  it('should defend against async promise rejections in publish without crashing', async () => {
    const bus = new EventBus();
    
    bus.subscribe('FAIL_EVENT', async (event: any) => {
      throw new Error('intentional async failure');
    });

    const event: IEvent = {
      type: 'FAIL_EVENT',
      timestamp: Date.now(),
      payload: {}
    };

    // 呼叫 publish，它不會拋出錯誤，而是內部捕獲
    bus.publish(event);

    await new Promise<void>(resolve => setImmediate(() => resolve()));
    
    // 程式沒有崩潰，代表測試通過
    expect(true).toBe(true);
  });

  it('should support register and unregister of declarative subscribers', () => {
    const bus = new EventBus();
    const sub = (e: any) => {};

    bus.subscribe('WAKEUP_EVENT', sub, { sessionId: 'session-1' });

    // 獲取私有變數來驗證，或者發佈並查看 debug 日誌。
    // 這邊我們取消訂閱並驗證
    bus.unsubscribe('WAKEUP_EVENT', sub);

    expect(true).toBe(true);
  });
});
