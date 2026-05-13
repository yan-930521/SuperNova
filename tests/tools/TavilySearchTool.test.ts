import axios from 'axios';
import { TavilySearchTool } from '../../src/tool/common/TavilySearchTool';
import { IToolContext } from '../../interfaces/tool/IToolContext';

// 模擬 axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TavilySearchTool', () => {
  let tool: TavilySearchTool;
  const mockContext: IToolContext = {
    sessionId: 'test-session',
    agentId: 'test-agent'
  } as any;

  beforeEach(() => {
    tool = new TavilySearchTool();
    // 設定測試用的 API Key
    process.env.TAVILY_API_KEY = 'test-key';
    jest.clearAllMocks();
  });

  it('應能成功搜尋並回傳格式化後的結果', async () => {
    const mockResponse = {
      data: {
        results: [
          {
            title: 'Test Title',
            url: 'https://test.com',
            content: 'Test Content',
            score: 0.95,
            extra: 'ignore me'
          }
        ]
      }
    };
    mockedAxios.post.mockResolvedValueOnce(mockResponse);

    const result = await tool.run({ query: 'test' }, mockContext);

    // 驗證結果
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Test Title',
      url: 'https://test.com',
      content: 'Test Content',
      score: 0.95
    });
    
    // 驗證 API 呼叫參數
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        api_key: 'test-key',
        query: 'test',
        max_results: 5
      })
    );
  });

  it('當 API Key 缺失時應拋出錯誤', async () => {
    delete process.env.TAVILY_API_KEY;
    await expect(tool.run({ query: 'test' }, mockContext)).rejects.toThrow('TAVILY_API_KEY is not configured');
  });

  it('當 API 請求失敗時應拋出錯誤', async () => {
    const errorMessage = 'Network Error';
    mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));
    
    await expect(tool.run({ query: 'test' }, mockContext)).rejects.toThrow(`Tavily API error: ${errorMessage}`);
  });

  it('當 API 回傳 401 等錯誤時應提取 detail 訊息', async () => {
    const mockError = {
      response: {
        data: {
          detail: 'Unauthorized API Key'
        }
      }
    };
    mockedAxios.post.mockRejectedValueOnce(mockError);
    
    await expect(tool.run({ query: 'test' }, mockContext)).rejects.toThrow('Tavily API error: Unauthorized API Key');
  });
});
