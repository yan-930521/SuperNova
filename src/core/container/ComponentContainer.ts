import { ILifecycle } from '../lifecycle/ILifecycle';

/**
 * 組件容器，負責管理組件的註冊、解析以及生命週期調度
 */
export class ComponentContainer {
  private components: Map<string, any> = new Map();
  private lifecycles: ILifecycle[] = [];

  /**
   * 註冊組件
   * @param name 組件名稱
   * @param component 組件實例
   */
  register<T>(name: string, component: T): void {
    this.components.set(name, component);
    
    // 如果組件實作了 initialize 或 start 方法，則將其視為生命週期組件
    // 這裡使用簡單的類型檢查來識別生命週期對象
    const maybeLifecycle = component as any;
    if (maybeLifecycle.initialize || maybeLifecycle.start || maybeLifecycle.stop) {
      this.lifecycles.push(maybeLifecycle as ILifecycle);
    }
  }

  /**
   * 解析組件
   * @param name 組件名稱
   * @returns 組件實例
   */
  resolve<T>(name: string): T {
    const component = this.components.get(name);
    if (!component) {
      throw new Error(`Component ${name} not found`);
    }
    return component;
  }

  /**
   * 啟動容器，按順序執行所有組件的初始化與啟動
   */
  async boot(): Promise<void> {
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
  }

  /**
   * 停止容器，執行所有組件的停止流程
   */
  async shutdown(): Promise<void> {
    // 以相反順序停止組件通常是較好的做法
    const reversedLifecycles = [...this.lifecycles].reverse();
    for (const comp of reversedLifecycles) {
      if (comp.stop) {
        await comp.stop();
      }
    }
  }
}
