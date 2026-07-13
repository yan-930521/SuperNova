import * as fs from 'fs/promises';
import * as path from 'path';

import { LogManager } from '../core/infra/LogManager';
import { Config, DeepPartial } from './Config';
import { DEFAULT_CONFIG } from './DefaultConfig';

/**
 * ConfigLoader 類
 * 負責系統配置的加載、合併、持久化與不可變性處理。
 */
export class ConfigLoader {
    /**
     * 系統引導啟動 (Bootstrap)
     * 執行「檢查檔案 -> 缺失則生成 -> 讀取 -> 合併 -> 凍結」的完整流程。
     * @param targetPath 配置檔案的儲存路徑
     * @returns 最終生效的完整且不可變的配置物件
     */
    async bootstrap(targetPath: string): Promise<Config> {
        let customConfig: DeepPartial<Config> = {};

        try {
            // 嘗試訪問檔案
            await fs.access(targetPath);

            // 檔案存在，執行讀取與解析
            const content = await fs.readFile(targetPath, 'utf-8');
            try {
                customConfig = JSON.parse(content);
            } catch (parseError) {
                // 若解析失敗，記錄錯誤並拋出，防止以損壞的配置啟動
                LogManager.recorder.error(`[ConfigLoader] Failed to parse config file at ${targetPath}:`, { payload: { error: parseError }, type: 'SYSTEM' });
                throw parseError;
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // 檔案不存在：執行初始化生成邏輯
                LogManager.recorder.info(`[ConfigLoader] Config file not found. Generating default at ${targetPath}`, { type: 'SYSTEM' });

                // 確保目標目錄存在
                const dir = path.dirname(targetPath);
                await fs.mkdir(dir, { recursive: true });

                // 將預設配置序列化為帶縮排的 JSON 格式
                const defaultConfigJson = JSON.stringify(DEFAULT_CONFIG, null, 2);
                await fs.writeFile(targetPath, defaultConfigJson, 'utf-8');
            } else {
                // 其他系統級別的檔案訪問錯誤
                throw error;
            }
        }

        // 調用 load 進行深層合併與深度凍結
        return this.load(customConfig);
    }

    /**
     * 手動加載與合併
     * 將傳入的局部配置與系統預設配置進行深層合併，並返回深度凍結後的物件。
     * @param custom 局部自定義配置
     * @returns 合併後的完整配置
     */
    load(custom?: DeepPartial<Config>): Config {
        // 深度拷貝預設配置作為基礎，避免修改原始 DEFAULT_CONFIG 參照
        const base: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

        // 執行合併邏輯
        const merged = this.deepMerge(base, custom || {});

        // 執行深度凍結並返回
        return this.deepFreeze(merged) as Config;
    }

    /**
     * 內部輔助函數：深層合併物件
     * 遞迴地將 source 的屬性覆蓋到 target 上。
     * @param target 被合併的目標物件 (會被原地修改)
     * @param source 提供覆蓋值的來源物件
     */
    private deepMerge(target: any, source: any): any {
        if (!source || typeof source !== 'object') return target;

        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                const sourceValue = source[key];
                const targetValue = target[key];

                // 若屬性值皆為物件且非陣列，則遞迴執行合併
                if (
                    sourceValue &&
                    typeof sourceValue === 'object' &&
                    !Array.isArray(sourceValue)
                ) {
                    if (!targetValue || typeof targetValue !== 'object') {
                        target[key] = {};
                    }
                    this.deepMerge(target[key], sourceValue);
                } else {
                    // 否則直接覆蓋（基本型別、陣列或 null）
                    target[key] = sourceValue;
                }
            }
        }
        return target;
    }

    /**
     * 內部輔助函數：深度凍結物件
     * 遞迴地對物件及其所有子屬性執行 Object.freeze。
     * @param obj 要凍結的物件
     */
    private deepFreeze(obj: any): any {
        if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
            return obj;
        }

        // 取得所有自身屬性
        const propNames = Object.getOwnPropertyNames(obj);

        for (const name of propNames) {
            const value = obj[name];
            // 遞迴凍結屬性值
            if (value && typeof value === 'object') {
                this.deepFreeze(value);
            }
        }

        return Object.freeze(obj);
    }
}
