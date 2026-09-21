import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 處理 JSONLines (JSONL) 格式儲存的基礎 Repository (適合日誌、對話歷史等不斷 Append 的資料)
 * @template T 儲存的資料型別
 */
export abstract class BaseJsonlRepository<T> {
    constructor(protected readonly baseDir: string) {
        if (!existsSync(this.baseDir)) {
            mkdirSync(this.baseDir, { recursive: true });
        }
    }

    /**
     * 子類別必須實作此方法，決定資料要存放在哪個具體的檔案路徑
     */
    protected abstract getFilePath(...args: any[]): string;

    /**
     * 追加單筆或多筆記錄到 JSONL 檔案末尾
     */
    protected async appendJsonl(filePath: string, data: T | T[]): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            const items = Array.isArray(data) ? data : [data];
            if (items.length === 0) return;

            const lines = items.map(item => JSON.stringify(item)).join('\n') + '\n';
            await fs.appendFile(filePath, lines, 'utf-8');
        } catch (error: any) {
            console.error(`[BaseJsonlRepository] Failed to append to ${filePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 讀取整個 JSONL 檔案並解析為陣列
     */
    protected async readAllJsonl(filePath: string): Promise<T[]> {
        try {
            if (!existsSync(filePath)) {
                return [];
            }
            
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim().length > 0);
            
            return lines.map(line => {
                try {
                    return JSON.parse(line) as T;
                } catch {
                    return null;
                }
            }).filter((item): item is T => item !== null);
        } catch (error: any) {
            console.error(`[BaseJsonlRepository] Failed to read ${filePath}: ${error.message}`);
            return [];
        }
    }

    /**
     * 覆寫整個 JSONL 檔案 (例如過濾或清理歷史記錄後重新寫入)
     */
    protected async overwriteJsonl(filePath: string, data: T[]): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            const lines = data.map(item => JSON.stringify(item)).join('\n') + '\n';
            await fs.writeFile(filePath, lines, 'utf-8');
        } catch (error: any) {
            console.error(`[BaseJsonlRepository] Failed to overwrite ${filePath}: ${error.message}`);
            throw error;
        }
    }
}
