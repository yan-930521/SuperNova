import { IGuardian } from '../../interfaces/runtime/IGuardian';

/**
 * 超時錯誤類
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Task execution timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * 穩定性守護者實作 (Guardian Implementation)
 * 負責隔離不穩定的工具調用與異步任務。
 */
export class Guardian implements IGuardian {
  /**
   * 在防護模式下執行任務
   * @param task 待執行的異步閉包
   * @param timeout 超時時間 (ms)
   */
  async protect<T>(task: () => Promise<T>, timeout: number): Promise<T> {
    let timer: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new TimeoutError(`Execution exceeded ${timeout}ms`));
      }, timeout);
    });

    try {
      // 使用 Promise.race 競爭任務執行與超時定時器
      const result = await Promise.race([task(), timeoutPromise]);
      clearTimeout(timer!);
      return result as T;
    } catch (error) {
      clearTimeout(timer!);
      throw error;
    }
  }

  /**
   * 根據錯誤類型裁決恢復策略
   * @param error 捕獲到的錯誤對象
   */
  resolveStrategy(error: Error): 'RETRY' | 'ABORT' | 'IGNORE' {
    if (error instanceof TimeoutError) {
      // 超時建議重試 (RETRY)
      return 'RETRY';
    }

    if (error.name === 'SyntaxError' || error.name === 'ReferenceError') {
      // 代碼層級的致命錯誤建議中止 (ABORT)
      return 'ABORT';
    }

    // 預設行為
    return 'IGNORE';
  }
}
