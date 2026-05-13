import { z } from 'zod';

import { TavilySearch } from '@langchain/tavily';

import { IToolContext } from '../../../interfaces/tool/IToolContext';
import { BaseTool } from '../BaseTool';

const TavilySearchSchema = z.object({
  query: z.string().describe('搜尋關鍵字'),
  includeDomains: z.array(z.string()).optional().describe('要包含的網域列表'),
  excludeDomains: z.array(z.string()).optional().describe('要排除的網域列表'),
  searchDepth: z.enum(['basic', 'advanced']).optional().describe('搜尋深度'),
  includeImages: z.boolean().optional().describe('是否包含圖片結果'),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional().describe('時間範圍'),
  topic: z.enum(['general', 'news', 'finance']).optional().describe('搜尋主題'),
  max_results: z.number().optional().default(5).describe('最大回傳結果數量')
});

type TavilySearchInput = {
  query: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  searchDepth?: 'basic' | 'advanced';
  includeImages?: boolean;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  topic?: 'general' | 'news' | 'finance';
  max_results?: number;
};

/**
 * TavilySearchTool 聯網搜尋工具
 * 封裝 LangChain 提供之 Tavily 搜尋功能。
 */
export class TavilySearchTool extends BaseTool<TavilySearchInput, any> {
  private innerTool: TavilySearch;

  constructor() {
    super(
      'WebSearch',
      '使用 Tavily API 進行網頁搜尋，獲取最新資訊。',
      'TIER_1',
      ['WEB_SEARCH'],
      TavilySearchSchema
    );
    
    this.innerTool = new TavilySearch({
      maxResults: 5
    });
  }

  /**
   * 執行搜尋邏輯
   * @param input 搜尋參數
   * @param context 工具執行上下文
   */
  async run(input: TavilySearchInput, context: IToolContext): Promise<any> {
    try {
      // 確保 API Key 存在於環境變數中，TavilySearch 會自動從 process.env.TAVILY_API_KEY 讀取
      // 將 input 映射到 TavilySearch 期望的參數格式
      const result = await this.innerTool.invoke({
        query: input.query,
        includeDomains: input.includeDomains,
        excludeDomains: input.excludeDomains,
        searchDepth: input.searchDepth,
        includeImages: input.includeImages,
        timeRange: input.timeRange,
        topic: input.topic,
        // 注意：invoke 時可能不支援 maxResults (有些版本是在構造函數設定)，
        // 這裡我們先傳遞其餘支援的參數。
      });
      return result;
    } catch (error: any) {
      throw new Error(`Tavily Search failed: ${error.message}`);
    }
  }
}
