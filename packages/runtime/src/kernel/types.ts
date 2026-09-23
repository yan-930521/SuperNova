import { ILifecycle } from '../lifecycle/ILifecycle';

/**
 * 內核生命週期狀態機
 */
export enum KernelState {
    /** 初始化階段：正註冊基礎服務與掛載初始外掛 */
    INITIALIZING = 'INITIALIZING',
    /** 運行中：內核已啟動，心跳引擎與所有服務就緒 */
    RUNNING = 'RUNNING',
    /** 關閉中：正依序終止外掛與釋放資源 */
    STOPPING = 'STOPPING',
    /** 已終止：所有連線與定時器已清除 */
    STOPPED = 'STOPPED',
}

/**
 * 內核外掛介面 (Kernel Plugin)
 * 遵循合併設計：外掛即是具備生命週期的系統服務 (extends ILifecycle)
 * 強制實作 initialize(), start(), stop() 並具備 install(kernel) 注入能力
 */
export interface IKernelPlugin extends ILifecycle {
    /** 外掛/系統服務唯一識別名稱 */
    readonly name: string;

    /**
     * 安裝鉤子：將 kernel 上下文注入給外掛
     * 用於向內核宣告相依性或掛載底層管線
     * @param kernel 宿主內核實例
     */
    install(kernel: IKernel): void | Promise<void>;
}

/**
 * 微內核核心介面
 */
export interface IKernel {
    /** 目前內核運行狀態 */
    readonly state: KernelState;

    /**
     * 註冊全局服務實例
     * 若服務實作了 ILifecycle，Kernel 將自動納入生命週期隊列調度
     * @param name 服務名稱
     * @param service 服務物件實例
     */
    registerService<T>(name: string, service: T): void;

    /**
     * 取得已註冊的全局服務
     * @param name 服務名稱
     */
    getService<T>(name: string): T;

    /**
     * 檢查特定服務是否已註冊
     * @param name 服務名稱
     */
    hasService(name: string): boolean;

    /**
     * 掛載外掛至內核中
     * 自動觸發 install，將外掛註冊為全局服務並託管生命週期（保證不重複調用）
     * @param plugin 外掛實例
     */
    use(plugin: IKernelPlugin): Promise<this>;

    /**
     * 啟動內核與所有已託管之生命週期組件 (initialize -> start)
     */
    boot(): Promise<void>;

    /**
     * 停止內核並逆序安全關閉所有組件 (stop)
     */
    stop(): Promise<void>;
}
