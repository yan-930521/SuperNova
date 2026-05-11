import { BaseSession } from '../../src/session/BaseSession';
import { IMiddleware } from '../../interfaces/session/IMiddleware';

describe('BaseSession', () => {
  it('should allow registering middlewares to different pipelines', () => {
    const session = new BaseSession('test-session', 'to test');
    const middleware: IMiddleware = {
      execute: async (ctx, next) => { await next(); }
    };
    
    expect(() => session.use('TOOL', middleware)).not.toThrow();
    expect(() => session.use('MUTATION', middleware)).not.toThrow();
  });

  it('should integrate MiddlewareChain into a mock execution flow', async () => {
    const session = new BaseSession('test-session', 'to test');
    let called = false;
    
    session.use('TOOL', {
      execute: async (ctx, next) => {
        called = true;
        await next();
      }
    });

    // 模擬一個工具調用流，這通常會在 tick() 內部發生
    // 這裡直接測試內部鏈接
    const ctx = { session_id: session.id, target: 'test-tool', data: {} };
    // @ts-ignore: Access protected for testing integration
    await session.toolChain.execute(ctx, async () => {
      // Core task
    });

    expect(called).toBe(true);
  });
});
