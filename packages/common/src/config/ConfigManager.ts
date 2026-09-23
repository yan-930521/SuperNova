import * as fs from 'fs';
import * as path from 'path';
import { YAML } from 'bun';
import { z } from 'zod';

import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';

import { EnvParser } from './EnvParser';
import { ConfigLoadOptions, ConfigSectionDefinition, IConfigManager } from './types';

/**
 * 設定驗證錯誤封裝
 */
export class ConfigValidationError extends Error {
    public readonly errors: Record<string, string[]>;

    constructor(errors: Record<string, string[]>) {
        const details = Object.entries(errors)
            .map(([sec, msgs]) => `  - [Section "${sec}"]:\n    ${msgs.join('\n    ')}`)
            .join('\n');
        super(`Configuration validation failed:\n${details}`);
        this.name = 'ConfigValidationError';
        this.errors = errors;
    }
}

/**
 * 可擴展配置管理器 (Extensible Config Manager)
 * 遵循微內核原則：按需註冊子設定、多來源階梯覆蓋、環境變數轉型、Zod 嚴格校驗與深度凍結
 */
export class ConfigManager implements IConfigManager {
    /** 已註冊的子設定規格表 */
    private readonly sections = new Map<string, ConfigSectionDefinition>();

    /** 聚合、校驗並凍結後的最終配置資料 */
    private loadedConfig: Record<string, any> = {};

    /** 是否已完成載入 */
    private isLoaded = false;

    /** 統一日誌記錄器 */
    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'ConfigManager' })
        .addTransport(new ConsoleTransport('DEBUG'));

    /**
     * 動態註冊一個獨立的子設定區塊
     * @param name 區塊名稱 (例如 'llm', 'storage', 'agent')
     * @param schema Zod 驗證架構
     * @param defaults 該區塊的預設數值
     */
    public registerSection<T>(name: string, schema: z.ZodType<T>, defaults: T): this {
        if (this.sections.has(name)) {
            this.logger.warn(`Config section [${name}] is already registered. Overwriting definition.`);
        } else {
            this.logger.debug(`Registering config section [${name}]`);
        }

        this.sections.set(name, {
            name,
            schema,
            defaults,
        });

        return this;
    }

    /**
     * 檢查特定區塊是否已註冊
     */
    public hasSection(name: string): boolean {
        return this.sections.has(name);
    }

    /**
     * 載入並聚合配置：預設值 < 檔案 < 環境變數 < 執行期覆寫
     * 並對所有已註冊區塊發動 Zod 嚴格驗證
     */
    public async load(options?: ConfigLoadOptions): Promise<void> {
        this.logger.info('Loading and aggregating configuration sources...');

        // 1. 收集所有區塊的預設值 (Defaults)
        let merged: Record<string, any> = {};
        for (const [name, def] of this.sections.entries()) {
            merged[name] = this.deepClone(def.defaults);
        }

        // 2. 讀取外部設定檔 (支援 JSON 或 YAML 格式，若不存在則依選項自動產生範本)
        if (options?.filePath) {
            const generateIfMissing = options.generateIfMissing ?? true;
            const fileData = await this.readConfigFile(options.filePath, generateIfMissing);
            if (fileData) {
                merged = this.deepMerge(merged, fileData);
            }
        }

        // 3. 讀取環境變數 (ENV)
        const envPrefix = options?.envPrefix ?? 'SUPERNOVA_';
        const envData = EnvParser.parse(process.env, envPrefix);
        if (Object.keys(envData).length > 0) {
            this.logger.debug(`Applying environment variables with prefix [${envPrefix}]`);
            merged = this.deepMerge(merged, envData);
        }

        // 4. 讀取執行期顯式覆寫 (Overrides)
        if (options?.overrides && Object.keys(options.overrides).length > 0) {
            this.logger.debug('Applying runtime overrides');
            merged = this.deepMerge(merged, options.overrides);
        }

        // 5. 依各區塊 Schema 執行嚴格驗證
        const validationErrors: Record<string, string[]> = {};
        const validatedConfig: Record<string, any> = {};

        for (const [name, def] of this.sections.entries()) {
            const sectionRawValue = merged[name] ?? {};
            const result = def.schema.safeParse(sectionRawValue);

            if (!result.success) {
                validationErrors[name] = result.error.issues?.map(
                    err => `${err.path.join('.') || 'root'}: ${err.message}`
                );
            } else {
                validatedConfig[name] = result.data;
            }
        }

        // 任何一處驗證失敗則中斷並報錯
        if (Object.keys(validationErrors).length > 0) {
            this.logger.error('Configuration validation failed');
            throw new ConfigValidationError(validationErrors);
        }

        // 6. 深度凍結並保存
        this.loadedConfig = this.deepFreeze(validatedConfig);
        this.isLoaded = true;

        this.logger.info('Configuration successfully loaded, validated, and frozen.');
    }

    /**
     * 取得特定區塊的強型別配置
     */
    public get<T>(sectionName: string): T {
        if (!this.isLoaded) {
            throw new Error(`Cannot get config [${sectionName}]: Configuration has not been loaded yet. Call load() first.`);
        }

        if (!this.sections.has(sectionName)) {
            throw new Error(`Config section [${sectionName}] is not registered.`);
        }

        return this.loadedConfig[sectionName] as T;
    }

    /**
     * 取得已聚合並凍結的完整配置
     */
    public getAll(): Readonly<Record<string, any>> {
        if (!this.isLoaded) {
            throw new Error('Configuration has not been loaded yet. Call load() first.');
        }
        return this.loadedConfig;
    }

    // ─── 內部輔助方法 ───

    /**
     * 讀取並解析設定檔 (支援 JSON 與 YAML 格式)
     * 若檔案不存在且 generateIfMissing 為 true，將自動生成具備註解說明的預設設定範本檔
     */
    private async readConfigFile(filePath: string, generateIfMissing: boolean): Promise<Record<string, any> | null> {
        try {
            const isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');

            if (!fs.existsSync(filePath)) {
                if (generateIfMissing) {
                    this.logger.info(`Config file [${filePath}] not found. Generating default template...`);
                    const dir = path.dirname(filePath);
                    if (dir && dir !== '.') {
                        await fs.promises.mkdir(dir, { recursive: true });
                    }

                    if (isYaml) {
                        const template = this.generateYamlTemplate();
                        await fs.promises.writeFile(filePath, template.trim() + '\n', 'utf-8');
                    } else {
                        const defaults: Record<string, any> = {};
                        for (const [name, def] of this.sections.entries()) {
                            defaults[name] = def.defaults;
                        }
                        await fs.promises.writeFile(filePath, JSON.stringify(defaults, null, 2) + '\n', 'utf-8');
                    }

                    this.logger.info(`Default configuration template written to [${filePath}]`);
                } else {
                    this.logger.warn(`Config file [${filePath}] not found. Skipping file configuration.`);
                    return null;
                }
            }

            const rawContent = await fs.promises.readFile(filePath, 'utf-8');
            if (isYaml) {
                return (YAML.parse(rawContent) as Record<string, any>) || {};
            }
            return JSON.parse(rawContent);
        } catch (error: any) {
            this.logger.error(`Failed to parse config file [${filePath}]: ${error.message}`);
            throw new Error(`Failed to parse config file [${filePath}]: ${error.message}`);
        }
    }

    /**
     * 依據已註冊的各區塊 Schema 與預設值逆向生成帶有註解說明的 YAML 範本字串
     */
    public generateYamlTemplate(): string {
        let fullYaml = '# ========================================================\n';
        fullYaml += '# SuperNova Configuration File (Auto-generated Template)\n';
        fullYaml += '# ========================================================\n\n';

        for (const [name, def] of this.sections.entries()) {
            fullYaml += `# --------------------------------------------------------\n`;
            fullYaml += `# Section: [${name}]\n`;
            if (def.schema.description) {
                fullYaml += `# ${def.schema.description.replace(/\n/g, '\n# ')}\n`;
            }
            fullYaml += `# --------------------------------------------------------\n`;
            fullYaml += `${name}:\n`;
            fullYaml += this.formatYamlObject(def.schema, def.defaults, 1);
            fullYaml += '\n';
        }

        return fullYaml;
    }

    /**
     * 遞迴格式化 YAML 物件並萃取 Zod 欄位註解
     */
    private formatYamlObject(schema: z.ZodTypeAny | undefined, values: any, indent: number = 0): string {
        if (values === null || typeof values !== 'object' || Array.isArray(values)) {
            return '';
        }

        const isObjectSchema = schema instanceof z.ZodObject;
        const isRecordSchema = schema instanceof z.ZodRecord;

        let yamlString = '';
        const spaces = '  '.repeat(indent);

        for (const key in values) {
            const fieldSchema = isObjectSchema
                ? (schema as z.ZodObject<any>).shape[key]
                : (isRecordSchema ? (schema as z.ZodRecord<any, any>).valueType : undefined);
            const value = values[key];

            if (fieldSchema?.description) {
                yamlString += `${spaces}# ${fieldSchema.description.replace(/\n/g, `\n${spaces}# `)}\n`;
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
                yamlString += this.formatYamlObject(fieldSchema, value, indent + 1);
            }
        }

        return yamlString;
    }

    /**
     * 深度物件合併 (Deep Merge)
     */
    private deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
        const output = { ...target };

        for (const [key, value] of Object.entries(source)) {
            if (
                value !== null &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                key in target &&
                typeof target[key] === 'object' &&
                !Array.isArray(target[key])
            ) {
                output[key] = this.deepMerge(target[key], value);
            } else {
                output[key] = value;
            }
        }

        return output;
    }

    /**
     * 深度複製 (Deep Clone)
     */
    private deepClone<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') return obj;
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * 深度物件凍結 (Deep Freeze)
     */
    private deepFreeze<T extends object>(obj: T): T {
        Object.freeze(obj);
        for (const prop of Object.getOwnPropertyNames(obj)) {
            const val = (obj as any)[prop];
            if (val !== null && (typeof val === 'object' || typeof val === 'function') && !Object.isFrozen(val)) {
                this.deepFreeze(val);
            }
        }
        return obj;
    }
}
