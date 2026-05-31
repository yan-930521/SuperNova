import type { GlobalRuntime } from '../runtime/GlobalRuntime';

/**
 * BaseManager (管理者基類)
 * 為所有 Manager 提供統一的運行時 (Runtime) 注入機制與生命週期管理。
 */
export abstract class BaseManager {
	protected runtime!: GlobalRuntime;

	/**
	 * 注入運行時實例
	 * 由 GlobalRuntime 在啟動過程中主動呼叫。
	 */
	public setRuntime(runtime: GlobalRuntime): void {
		this.runtime = runtime;
		this.onRuntimeInjected();
	}

	/**
	 * 生命週期鉤子：當 Runtime 注入完成後觸發。
	 * 子類別可覆寫此方法以執行依賴 Runtime 的初始化邏輯。
	 */
	protected onRuntimeInjected(): void {
		// 預留給子類實作
	}
}
