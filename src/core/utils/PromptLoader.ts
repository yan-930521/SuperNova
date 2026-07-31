import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../../core/config/Config';
import { LogManager } from '../../core/infra/LogManager';

/**
 * Prompt 加載器
 * 提供具備快取、錯誤處理與回退機制的 Prompt 讀取功能。
 */
interface CacheEntry {
  content: string;
  timestamp: number;
}

export class PromptLoader {
  private static cache: Map<string, CacheEntry> = new Map();
  private static readonly TTL_MS = 60000; // 60 seconds

  /**
   * 加載 Prompt 檔案內容 (附帶 TTL 快取機制)
   * @param relativePath 相對於項目根目錄的路徑
   * @param fallback 當讀取失敗時的回退文本
   */
  public static load(relativePath: string, fallback: string = ""): string {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const now = Date.now();

    // 1. 檢查快取及 TTL
    const cached = this.cache.get(absolutePath);
    if (cached && (now - cached.timestamp < this.TTL_MS)) {
      return cached.content;
    }

    try {
      // 2. 檢查檔案是否存在
      if (!fs.existsSync(absolutePath)) {
        LogManager.recorder.warn(`[PromptLoader] File not found: ${absolutePath}. Using fallback.`, { type: 'SYSTEM' });
        return fallback;
      }

      // 3. 讀取內容
      const content = fs.readFileSync(absolutePath, 'utf-8');
      this.cache.set(absolutePath, { content, timestamp: now });
      return content;
    } catch (error: any) {
      LogManager.recorder.error(`[PromptLoader] Failed to read prompt at ${absolutePath}: ${error.message}`, { type: 'SYSTEM' });
      return fallback;
    }
  }

  /**
   * 根據系統配置動態加載 Agent Profile (JSON 檔)
   * @param profileName Profile 名稱 (如 'main_agent')
   * @param config 系統配置
   * @param fallback 回退文本
   */
  public static loadProfile(profile: string, config: Config, fallback: string = ""): string {
    const relativePath = path.resolve(config.storage.base_dir, config.storage.agent_profile_dir, `${profile}.json`);
    return this.load(relativePath, fallback);
  }

  /**
   * 遞歸解析對象中的 Prompt 連結
   * 如果字串值以 .md 結尾，則嘗試從 prompts/ 目錄加載內容。
   * @param data 待解析的配置對象
   */
  public static resolvePrompts(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        data[i] = this.resolvePrompts(data[i]);
      }
      return data;
    }

    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.endsWith('.md')) {
        // 解析連結：路徑相對於 prompts/ 目錄
        const promptPath = `prompts/${value}`;
        resolved[key] = this.load(promptPath, `[Prompt file not found: ${value}]`);
      } else if (typeof value === 'object') {
        resolved[key] = this.resolvePrompts(value);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * 清除快取 (用於開發模式時動態更新)
   */
  public static clearCache(): void {
    this.cache.clear();
  }
}
