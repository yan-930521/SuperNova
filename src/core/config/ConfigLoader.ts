import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

import { LogManager } from '../infra/LogManager';
import { Config, ConfigSchema, DeepPartial } from './Config';
import { DEFAULT_CONFIG } from './DefaultConfig';

function generateCommentedConfig(schema: z.ZodTypeAny | undefined, values: any): any {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
        return values;
    }

    const isObjectSchema = schema instanceof z.ZodObject;
    const isRecordSchema = schema instanceof z.ZodRecord;

    const result: any = {};

    if (schema?.description) {
        result['__comment__'] = schema.description;
    }

    for (const key in values) {
        const fieldSchema = isObjectSchema ? schema.shape[key] : (isRecordSchema ? schema.valueType : undefined);
        
        if (fieldSchema?.description) {
            result[`__comment_${key}__`] = fieldSchema.description;
        }

        result[key] = generateCommentedConfig(fieldSchema, values[key]);
    }

    return result;
}

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
                // 移除 // 與 /* */ 註解，以便支援過渡期 jsonc 格式 (向下相容)
                const cleanContent = content.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
                customConfig = JSON.parse(cleanContent);
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
                if (dir && dir !== '.') {
                    await fs.mkdir(dir, { recursive: true });
                }

                // 利用 Zod schema 與 describe 產生帶有 __comment 鍵的 JSON 結構
                const commentedConfig = generateCommentedConfig(ConfigSchema, DEFAULT_CONFIG);
                const defaultConfigJson = JSON.stringify(commentedConfig, null, 2);
                
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
