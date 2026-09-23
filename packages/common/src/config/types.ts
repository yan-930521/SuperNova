import { z } from 'zod';

/**
 * 設定載入參數選項
 */
export interface ConfigLoadOptions {
    /** 外部設定檔路徑 (支援 JSON 或 YAML 格式) */
    filePath?: string;
    /** 若指定之設定檔不存在，是否自動依據註冊的 Schema 與預設值生成範本檔 (預設 true) */
    generateIfMissing?: boolean;
    /** 環境變數對齊前綴 (預設為 'SUPERNOVA_') */
    envPrefix?: string;
    /** 程式執行期顯式覆寫物件 (優先度最高) */
    overrides?: Record<string, any>;
}

/**
 * 子設定區塊註冊規格
 */
export interface ConfigSectionDefinition<T = any> {
    /** 區塊名稱 (例如 'llm', 'storage', 'agent') */
    name: string;
    /** Zod 驗證 Schema */
    schema: z.ZodType<T>;
    /** 預設數值 */
    defaults: T;
}

/**
 * 可擴展配置管理器介面
 */
export interface IConfigManager {
    /**
     * 動態註冊一個獨立的子設定區塊
     * @param name 區塊唯一名稱
     * @param schema 該區塊的 Zod 驗證架構
     * @param defaults 該區塊的預設值
     */
    registerSection<T>(name: string, schema: z.ZodType<T>, defaults: T): this;

    /**
     * 檢查特定區塊是否已註冊
     * @param name 區塊名稱
     */
    hasSection(name: string): boolean;

    /**
     * 載入並聚合所有來源的配置（預設值 -> 檔案 -> 環境變數 -> 執行期覆寫），並發動 Zod 驗證
     * @param options 載入選項
     */
    load(options?: ConfigLoadOptions): Promise<void>;

    /**
     * 取得特定區塊的強型別配置
     * @param sectionName 區塊名稱
     */
    get<T>(sectionName: string): T;

    /**
     * 取得已聚合並凍結的完整配置物件
     */
    getAll(): Readonly<Record<string, any>>;
}
