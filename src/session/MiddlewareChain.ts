import type { IMiddleware, IMiddlewareContext } from '../../interfaces/session/IMiddleware';

/**
 * 中間件鏈管理器
 * 負責維護中間件列表並執行組合後的流水線。
 */
export class MiddlewareChain {
  private middlewares: IMiddleware[] = [];

  /**
   * 註冊中間件
   * @param middleware 中間件實例
   */
  use(middleware: IMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 執行中間件鏈
   * @param ctx 執行上下文
   * @param coreTask 核心任務 (所有中間件執行完後的最後一個 next)
   */
  async execute(ctx: IMiddlewareContext, coreTask: () => Promise<void>): Promise<void> {
    const dispatch = async (index: number): Promise<void> => {
      if (index === this.middlewares.length) {
        return coreTask();
      }
      const middleware = this.middlewares[index];
      if (middleware) {
        await middleware.execute(ctx, () => dispatch(index + 1));
      }
    };

    return dispatch(0);
  }
}
