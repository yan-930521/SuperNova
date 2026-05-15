import { TavilySearchTool } from '../../src/tool/common/TavilySearchTool';
import { IToolContext } from '../../interfaces/tool/IToolContext';
import { TavilySearch } from '@langchain/tavily';

// 模擬 TavilySearch
jest.mock('@langchain/tavily');
const MockedTavilySearch = TavilySearch as jest.MockedClass<typeof TavilySearch>;

describe('TavilySearchTool', () => {
  let tool: TavilySearchTool;
  let mockTavilyInstance: any;
  const mockContext: IToolContext = {
    sessionId: 'test-session',
    agentId: 'test-agent'
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTavilyInstance = {
      invoke: jest.fn()
    };
    MockedTavilySearch.mockImplementation(() => mockTavilyInstance);
    
    // 設定測試用的 API Key
    process.env.TAVILY_API_KEY = 'test-key';
    tool = new TavilySearchTool();
  });

  it('應能成功搜尋並回傳格式化後的結果', async () => {
    const mockResponse = {
      results: [
        {
          title: 'Test Title',
          url: 'https://test.com',
          content: 'Test Content',
          score: 0.95,
          extra: 'ignore me'
        }
      ]
    };
    mockTavilyInstance.invoke.mockResolvedValueOnce(mockResponse);

    const result = await tool.run({ query: 'test' }, mockContext);

    // 驗證結果
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Test Title',
      url: 'https://test.com',
      content: 'Test Content',
      score: 0.95
    });
    
    // 驗證 invoke 呼叫參數
    expect(mockTavilyInstance.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'test'
      })
    );
  });

  it('當 API Key 缺失時應拋出錯誤', async () => {
    delete process.env.TAVILY_API_KEY;
    await expect(tool.run({ query: 'test' }, mockContext)).rejects.toThrow('TAVILY_API_KEY is not configured');
  });

  it('當 API 請求失敗時應拋出錯誤', async () => {
    const errorMessage = 'Network Error';
    mockTavilyInstance.invoke.mockRejectedValueOnce(new Error(errorMessage));
    
    await expect(tool.run({ query: 'test' }, mockContext)).rejects.toThrow(`Tavily API error: ${errorMessage}`);
  });

  it('當 API 回傳 401 等錯誤時應提取 detail 訊息', async () => {
    // 這裡我們模擬 TavilySearch 拋出的錯誤訊息
    mockTavilyInstance.invoke.mockRejectedValueOnce(new Error('Unauthorized'));
    
    await expect(tool.run({ query: 'test' }, mockContext)).rejects.toThrow('Tavily API error: Unauthorized');
  });
});
