import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../infra/LogManager';

/**
 * Prompt 加載器
 * 提供具備快取、錯誤處理與回退機制的 Prompt 讀取功能。
 */
export class PromptLoader {
  private static cache: Map<string, string> = new Map();

  /**
   * 加載 Prompt 檔案內容
   * @param relativePath 相對於項目根目錄的路徑
   * @param fallback 當讀取失敗時的回退文本
   */
  public static load(relativePath: string, fallback: string = ""): string {
    const absolutePath = path.resolve(process.cwd(), relativePath);

    // 1. 檢查快取
    if (this.cache.has(absolutePath)) {
      return this.cache.get(absolutePath)!;
    }

    try {
      // 2. 檢查檔案是否存在
      if (!fs.existsSync(absolutePath)) {
        logger.warn(`[PromptLoader] File not found: ${absolutePath}. Using fallback.`, { type: 'SYSTEM' });
        return fallback;
      }

      // 3. 讀取內容
      const content = fs.readFileSync(absolutePath, 'utf-8');
      this.cache.set(absolutePath, content);
      return content;
    } catch (error: any) {
      logger.error(`[PromptLoader] Failed to read prompt at ${absolutePath}: ${error.message}`, { type: 'SYSTEM' });
      return fallback;
    }
  }

  /**
   * 渲染 Prompt 模板 (替換 {{key}} 或 {key})
   * @param template 模板字串
   * @param data 數據對象
   */
  public static render(template: string, data: Record<string, any>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(data)) {
      const stringValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      // 支援 {{key}} 格式
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), stringValue);
      // 支援 LangChain 風格的 {key} 格式 (僅當 key 不包含在 {{}} 中時，為簡單起見，這裡直接 replace)
      rendered = rendered.replace(new RegExp(`{${key}}`, 'g'), stringValue);
    }
    return rendered;
  }

  /**
   * 遞歸解析對象中的 Prompt 連結
   * 如果字串值以 .md 結尾，則嘗試從 prompts/ 目錄加載內容。
   * @param data 待解析的配置對象
   */
  public static async resolvePrompts(data: any): Promise<any> {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        data[i] = await this.resolvePrompts(data[i]);
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
        resolved[key] = await this.resolvePrompts(value);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * 清除快取 (用於開發模式或動態更新)
   */
  public static clearCache(): void {
    this.cache.clear();
  }
}
