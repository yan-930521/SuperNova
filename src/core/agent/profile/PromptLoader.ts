import * as fs from 'fs';
import * as path from 'path';
import { LogManager } from '@supernova/common/LogManager';
import { LRUCache } from '@supernova/common/LRUCache';
import { DEFAULT_STORAGE_CONFIG, StorageConfig } from '../../config';
import { AgentProfile } from './types';

/**
 * Prompt 加載器選項
 */
export interface PromptLoaderOptions {
    /** 儲存設定規格 */
    storage?: StorageConfig;
    /** Profile 版本子目錄 (預設 'v1') */
    version?: string;
    /** 專案根目錄 (預設 process.cwd()) */
    cwd?: string;
}

/**
 * Prompt 與 Agent Profile 加載器 (PromptLoader)
 * 提供具備 LRU TTL 快取、檔案系統解析、Markdown 遞迴連結解析與回退機制的讀取器。
 */
export class PromptLoader {
    private static cache = new LRUCache<string, string>(100, 60000);
    private static logger = new LogManager({ type: 'SYSTEM', name: 'PromptLoader' });

    /**
     * 重設快取容量與過期時間
     * @param lruSize 快取項目上限 (預設 100)
     * @param ttlMs 快取存活時間毫秒數 (預設 60000)
     */
    public static configureCache(lruSize: number = 100, ttlMs: number = 60000): void {
        this.cache = new LRUCache<string, string>(lruSize, ttlMs);
    }

    /**
     * 加載一般文字或 Prompt 檔案內容 (附帶 TTL 快取機制)
     * @param filePath 檔案絕對路徑或相對於根目錄之路徑
     * @param fallback 當讀取失敗時的回退文本
     */
    public static load(filePath: string, fallback: string = ''): string {
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(process.cwd(), filePath);

        // 1. 檢查快取及 TTL (LRUCache 內部已自動處理超時)
        const cached = this.cache.get(absolutePath);
        if (cached !== undefined) {
            return cached;
        }

        try {
            // 2. 檢查檔案是否存在
            if (!fs.existsSync(absolutePath)) {
                this.logger.warn(`File not found: ${absolutePath}. Using fallback.`);
                return fallback;
            }

            // 3. 讀取檔案內容
            const content = fs.readFileSync(absolutePath, 'utf-8');
            this.cache.set(absolutePath, content);
            return content;
        } catch (error: any) {
            this.logger.error(`Failed to read prompt at ${absolutePath}: ${error.message}`);
            return fallback;
        }
    }

    /**
     * 根據系統配置動態載入 Agent Profile (JSON 檔)
     * 路徑解析規則：{base_dir}/{profile_dir}/{version}/{profileName}.json
     * @param profileName Profile 名稱 (如 'main_agent', 'task_agent')
     * @param options 加載選項
     */
    public static loadProfile(profileName: string, options: PromptLoaderOptions = {}): AgentProfile | null {
        const storage = options.storage ?? DEFAULT_STORAGE_CONFIG;
        const version = options.version ?? storage.profile_version ?? 'v1';
        const baseDir = storage.base_dir;
        const profileDir = storage.profile_dir;

        // 組裝 Profile JSON 檔案的絕對或相對路徑
        const cleanName = profileName.endsWith('.json') ? profileName : `${profileName}.json`;
        const profilePath = path.resolve(
            options.cwd ?? process.cwd(),
            baseDir,
            profileDir,
            version,
            cleanName
        );

        const rawContent = this.load(profilePath);
        if (!rawContent) {
            this.logger.warn(`Could not load profile: ${cleanName} from ${profilePath}`);
            return null;
        }

        try {
            const parsed = JSON.parse(rawContent);
            // 遞迴解析內容中可能嵌入的 .md Prompt 外部引用
            return this.resolvePrompts(parsed, options) as AgentProfile;
        } catch (error: any) {
            this.logger.error(`Failed to parse profile JSON [${profilePath}]: ${error.message}`);
            return null;
        }
    }

    /**
     * 遞迴解析物件中可能包含的 Prompt 外部連結
     * 若字串值以 .md 結尾，則嘗試從專案 prompts/ 目錄或相對路徑載入真實文字。
     * @param data 待解析的配置或 Profile 物件
     * @param options 配置選項
     */
    public static resolvePrompts(data: any, options: PromptLoaderOptions = {}): any {
        if (typeof data !== 'object' || data === null) {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map((item) => this.resolvePrompts(item, options));
        }

        const resolved: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && value.endsWith('.md')) {
                // 優先在 prompts/ 目錄下尋找
                const promptPath = path.resolve(options.cwd ?? process.cwd(), 'prompts', value);
                resolved[key] = this.load(promptPath, `[Prompt file not found: ${value}]`);
            } else if (typeof value === 'object') {
                resolved[key] = this.resolvePrompts(value, options);
            } else {
                resolved[key] = value;
            }
        }
        return resolved;
    }

    /**
     * 清空內部快取 (主要用於熱重載與單元測試環境)
     */
    public static clearCache(): void {
        this.cache.clear();
    }
}
