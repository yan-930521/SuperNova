import type { IHook } from '../../interfaces/hook/IHook';
import { logger } from './LogManager';

/**
 * Hook 註冊表
 * 負責系統中所有擴展點的生命週期管理。
 */
export class HookRegistry {
  private hooks: Map<string, IHook> = new Map();

  /**
   * 註冊一個新的 Hook
   */
  register(hook: IHook): void {
    if (this.hooks.has(hook.name)) {
      logger.warn(`[HookRegistry] Overwriting existing hook: ${hook.name}`, { type: 'SYSTEM' });
    }
    this.hooks.set(hook.name, hook);
    logger.info(`[HookRegistry] Registered hook: ${hook.name} (v${hook.version})`, { type: 'SYSTEM' });
  }

  /**
   * 獲取指定名稱的 Hook
   */
  getHook(name: string): IHook | undefined {
    return this.hooks.get(name);
  }

  /**
   * 獲取所有已註冊的 Hook
   */
  getAllHooks(): IHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * 更新 Hook 版本 (用於 MVCC)
   */
  updateVersion(name: string, newVersion: string): void {
    const hook = this.hooks.get(name);
    if (hook) {
      hook.version = newVersion;
    }
  }
}
