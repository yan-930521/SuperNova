import { z } from 'zod';

import { TavilySearch } from '@langchain/tavily';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseTool } from '../BaseTool';

const TavilySearchSchema = z.object({
  query: z.string().describe('Search query string'),
  includeDomains: z.array(z.string()).optional().describe('Domains to include'),
  excludeDomains: z.array(z.string()).optional().describe('Domains to exclude'),
  searchDepth: z.enum(['basic', 'advanced']).optional().describe('Search depth'),
  includeImages: z.boolean().optional().describe('Whether to include images'),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional().describe('Time range'),
  topic: z.enum(['general', 'news', 'finance']).optional().describe('Search topic'),
  max_results: z.number().optional().default(5).describe('Maximum number of results')
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
 * TavilySearchTool
 * Web search tool powered by Tavily via LangChain.
 */
export class TavilySearchTool extends BaseTool<TavilySearchInput, any> {
  private innerTool: TavilySearch;

  constructor() {
    super({
      name: 'web_search',
      description: 'Search the web using Tavily API for real-time information.',
      category: 'common',
      safety_tier: 'TIER_1',
      required_capabilities: ['WEB_SEARCH'],
      schema: TavilySearchSchema
    });

    this.innerTool = new TavilySearch({
      maxResults: 5
    });
  }

  async run(input: TavilySearchInput, context: IAgentExecuteContext): Promise<any> {
    if (!process.env.TAVILY_API_KEY) {
      throw new Error('TAVILY_API_KEY is not configured');
    }

    try {
      const result = await this.innerTool.invoke({
        query: input.query,
        includeDomains: input.includeDomains,
        excludeDomains: input.excludeDomains,
        searchDepth: input.searchDepth,
        includeImages: input.includeImages,
        timeRange: input.timeRange,
        topic: input.topic,
      });

      let parsedResult = result;
      if (typeof result === 'string') {
        try {
          parsedResult = JSON.parse(result);
        } catch (e) {
          return result;
        }
      }

      if (parsedResult && parsedResult.results && Array.isArray(parsedResult.results)) {
        const formattedResults = parsedResult.results.map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score
        }));
        return JSON.stringify(formattedResults);
      }

      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error: any) {
      throw new Error(`Tavily API error: ${error.message}`);
    }
  }
}
