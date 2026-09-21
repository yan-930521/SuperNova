import { YAML } from 'bun';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

import { LogManager } from '../LogManager';

const generateYamlTemplate = (schema: z.ZodTypeAny | undefined, values: any, indent: number = 0): string => {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
        return '';
    }

    const isObjectSchema = schema instanceof z.ZodObject;
    const isRecordSchema = schema instanceof z.ZodRecord;

    let yamlString = '';
    const spaces = ' '.repeat(indent);

    if (schema?.description && indent === 0) {
        yamlString += `${spaces}# ${schema.description.replace(/\n/g, `${spaces}# `)}\n`;
    }

    for (const key in values) {
        const fieldSchema = isObjectSchema ? schema.shape[key] : (isRecordSchema ? schema.valueType : undefined);
        const value = values[key];

        if (fieldSchema?.description) {
            yamlString += `${spaces}# ${fieldSchema.description.replace(/\n/g, `${spaces}# `)}\n`;
        }

        if (value === null || typeof value !== 'object') {
            yamlString += `${spaces}${key}: ${YAML.stringify(value).trim()}\n`;
        } else if (Array.isArray(value)) {
            yamlString += `${spaces}${key}:\n`;
            for (const item of value) {
                yamlString += `${spaces}  - ${YAML.stringify(item).trim()}\n`;
            }
        } else {
            yamlString += `${spaces}${key}:\n`;
            yamlString += generateYamlTemplate(fieldSchema, value, indent + 1);
        }
    }

    return yamlString;
};

/**
 * ConfigLoader 類
 * 泛型化設定檔載入器，負責系統配置的加載、合併、持久化與不可變性處理。
 */
export class ConfigLoader<T> {
    constructor(
        private readonly defaultValues: T,
        private readonly schema: z.ZodType<T>,
        private readonly logger: LogManager
    ) {}

    /**
     * 系統引導啟動 (Bootstrap)
     * 執行「檢查檔案 -> 缺失則生成 -> 讀取 -> 合併 -> 凍結」的完整流程。
     * @param targetPath 配置檔案的儲存路徑
     * @returns 最終生效的完整且不可變的配置物件
     */
    async bootstrap(targetPath: string): Promise<T> {
        let customConfig: Partial<T> = {};

        try {
            // 嘗試訪問檔案
            await fs.access(targetPath);

            // 檔案存在，執行讀取與解析 (使用 Bun 內建 YAML)
            const content = await fs.readFile(targetPath, 'utf-8');
            try {
                customConfig = YAML.parse(content) || {};
            } catch (parseError) {
                // 若解析失敗，記錄錯誤並拋出，防止以損壞的配置啟動
                this.logger.error(`Failed to parse config file at ${targetPath}:`, { payload: { error: parseError }, type: 'SYSTEM' });
                throw parseError;
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // 檔案不存在：執行初始化生成邏輯
                this.logger.info(`Config file not found. Generating default at ${targetPath}`, { type: 'SYSTEM' });

                // 確保目標目錄存在
                const dir = path.dirname(targetPath);
                if (dir && dir !== '.') {
                    await fs.mkdir(dir, { recursive: true });
                }

                // 利用 Zod schema 與 describe 產生完美的 YAML 註解模板
                const defaultYaml = generateYamlTemplate(this.schema, this.defaultValues);

                await fs.writeFile(targetPath, defaultYaml.trim() + '\n', 'utf-8');
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
    load(custom?: Partial<T>): T {
        // 深度拷貝預設配置作為基礎，避免修改原始預設值參照
        const base: T = JSON.parse(JSON.stringify(this.defaultValues));

        // 執行合併邏輯
        const merged = this.deepMerge(base, custom || {});

        // 執行深度凍結並返回
        return this.deepFreeze(merged) as T;
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
