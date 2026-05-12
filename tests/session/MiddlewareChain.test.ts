import { MiddlewareChain } from '../../src/session/MiddlewareChain';
import type { IMiddlewareContext } from '../../interfaces/session/IMiddleware';

describe('MiddlewareChain', () => {
  test('should execute middlewares in order', async () => {
    const chain = new MiddlewareChain();
    const order: number[] = [];

    chain.use({
      execute: async (ctx, next) => {
        order.push(1);
        await next();
        order.push(4);
      }
    });

    chain.use({
      execute: async (ctx, next) => {
        order.push(2);
        await next();
        order.push(3);
      }
    });

    const ctx: IMiddlewareContext = { session_id: 's1', target: 'test', data: {} };
    await chain.execute(ctx, async () => {
      // Core task
    });

    expect(order).toEqual([1, 2, 3, 4]);
  });

  test('should allow context modification', async () => {
    const chain = new MiddlewareChain();
    chain.use({
      execute: async (ctx, next) => {
        ctx.data.modified = true;
        await next();
      }
    });

    const ctx: IMiddlewareContext = { session_id: 's1', target: 'test', data: {} };
    await chain.execute(ctx, async () => {});

    expect(ctx.data.modified).toBe(true);
  });
});
