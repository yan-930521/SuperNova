import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 處理單一 JSON 檔案儲存的基礎 Repository
 * @template T 儲存的資料型別
 */
export abstract class BaseJsonRepository<T> {
    constructor(protected readonly baseDir: string) {
        if (!existsSync(this.baseDir)) {
            mkdirSync(this.baseDir, { recursive: true });
        }
    }

    /**
     * 子類別必須實作此方法，決定資料要存放在哪個具體的檔案路徑
     * @param args 解析路徑所需的參數 (例如 sessionId, agentId)
     */
    protected abstract getFilePath(...args: any[]): string;

    /**
     * 讀取並解析 JSON
     */
    protected async readJson(filePath: string): Promise<T | null> {
        try {
            if (!existsSync(filePath)) {
                return null;
            }
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data) as T;
        } catch (error: any) {
            console.error(`[BaseJsonRepository] Failed to read ${filePath}: ${error.message}`);
            return null;
        }
    }

    /**
     * 將資料序列化並寫入 JSON
     */
    protected async writeJson(filePath: string, data: T): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error: any) {
            console.error(`[BaseJsonRepository] Failed to write ${filePath}: ${error.message}`);
            throw error;
        }
    }
}
