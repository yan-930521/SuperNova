import { LogManager } from '../infra/LogManager';
import { ILifecycle } from '../lifecycle/ILifecycle';

/**
 * 組件容器，負責管理組件的註冊、解析以及生命週期調度
 */
export class ComponentContainer {
  private logger = new LogManager({ type: 'SYSTEM', agent_id: 'ComponentContainer' });

  /**
   * 存儲所有註冊的組件實例
   */
  private components: Map<string, unknown> = new Map();

  /**
   * 存儲所有具有生命週期的組件，用於統一調度
   */
  private lifecycles: ILifecycle[] = [];

  /**
   * 註冊組件到容器中
   * @param name 組件唯一名稱
   * @param component 組件實例
   */
  register<T>(name: string, component: T): void {
    if (this.components.has(name)) {
      throw new Error(`[ComponentContainer] Component name already exists: ${name}`);
    }

    this.components.set(name, component);

    // 檢查組件是否實作了生命週期介面
    if (this.isLifecycle(component)) {
      this.lifecycles.push(component);
    }
  }

  /**
   * 從容器中解析組件
   * @param name 組件名稱
   * @returns 組件實例
   */
  resolve<T>(name: string): T {
    const component = this.components.get(name);
    if (!component) {
      throw new Error(`[ComponentContainer] Component not found: ${name}`);
    }
    return component as T;
  }

  /**
   * 啟動容器，按順序執行所有組件的初始化與啟動
   * 順序：所有組件 initialize -> 所有組件 start
   */
  async boot(): Promise<void> {
    try {
      // 1. 執行所有組件的初始化
      for (const comp of this.lifecycles) {
        if (comp.initialize) {
          await comp.initialize();
        }
      }

      // 2. 執行所有組件的啟動
      for (const comp of this.lifecycles) {
        if (comp.start) {
          await comp.start();
        }
      }

      this.logger.info('[ComponentContainer] Container booted successfully');
    } catch (error) {
      // 啟動失敗時，記錄錯誤並重新拋出
      this.logger.error('[ComponentContainer] Container boot failed', {
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 停止容器，以註冊順序的逆序執行所有組件的停止流程
   */
  async shutdown(): Promise<void> {
    try {
      // 以相反順序停止組件，確保依賴關係能正確釋放
      const reversedLifecycles = [...this.lifecycles].reverse();
      for (const comp of reversedLifecycles) {
        if (comp.stop) {
          await comp.stop();
        }
      }

      this.logger.info('[ComponentContainer] Container stopped successfully');
    } catch (error) {
      // 停止失敗時，記錄錯誤並重新拋出
      this.logger.error('[ComponentContainer] Container shutdown failed', {
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 判斷對象是否實作了 ILifecycle 介面
   * @param obj 待檢查的對象
   */
  private isLifecycle(obj: unknown): obj is ILifecycle {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      ('initialize' in obj || 'start' in obj || 'stop' in obj)
    );
  }
}
