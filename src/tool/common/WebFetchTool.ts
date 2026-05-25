import axios from 'axios';
import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { BaseTool } from '../BaseTool';

/**
 * WebFetchTool
 * 獲取指定網址的原始 HTML 或純文字內容。
 */
export class WebFetchTool extends BaseTool {
  constructor() {
    super(
      'web_fetch',
      'Fetch the content of a specific URL.',
      'TIER_1',
      ['network'],
      z.object({
        url: z.string().url().describe('The URL to fetch.'),
        format: z.enum(['text', 'json', 'html']).optional().default('text').describe('Expected response format.')
      })
    );
  }

  async run(input: { url: string; format: string }, _context: IAgentExecuteContext): Promise<any> {
    try {
      const response = await axios.get(input.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (SuperNova-AI-Assistant)'
        }
      });

      let content = response.data;

      // 如果是 HTML，進行簡單的純文字提煉 (移除腳本與標籤)
      if (input.format === 'text' && typeof content === 'string') {
        content = content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      return {
        url: input.url,
        status: response.status,
        content: typeof content === 'object' ? JSON.stringify(content) : content.substring(0, 10000) // 截斷過長內容
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }
}
