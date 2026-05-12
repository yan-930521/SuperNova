import { EventBus } from '../../src/infra/EventBus';
import { AgentRegistry } from '../../src/infra/AgentRegistry';
import { ToolRegistry } from '../../src/infra/ToolRegistry';
import { SessionManager } from '../../src/infra/SessionManager';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { BaseAgent } from '../../src/agent/BaseAgent';
import { BaseSession } from '../../src/session/BaseSession';
import type { ITool, ToolSafetyTier } from '../../interfaces/tool/ITool';
import type { IToolContext } from '../../interfaces/tool/IToolContext';

// ==========================================
// 模擬工具 (Mock Tools)
// ==========================================

/**
 * 模擬的 SearchTool，用於測試工具註冊與調用
 * 具備 SEARCH 能力要求，安全評級為 TIER_1 (唯讀)
 */
class MockSearchTool implements ITool {
  name = 'SearchTool';
  description = 'Mock search tool for finding information';
  safety_tier: ToolSafetyTier = 'TIER_1';
  required_capabilities = ['SEARCH'];

  async validateInput(input: any): Promise<boolean> {
    return true;
  }

  async run(input: any, context: IToolContext): Promise<any> {
    return { result: 'search completed successfully' };
  }
}

/**
 * 模擬的 SummarizeTool，用於測試後續任務執行
 * 具備 SUMMARIZE 能力要求，安全評級為 TIER_1
 */
class MockSummarizeTool implements ITool {
  name = 'SummarizeTool';
  description = 'Mock summarize tool for synthesizing information';
  safety_tier: ToolSafetyTier = 'TIER_1';
  required_capabilities = ['SUMMARIZE'];

  async validateInput(input: any): Promise<boolean> {
    return true;
  }

  async run(input: any, context: IToolContext): Promise<any> {
    return { result: 'summarize completed successfully' };
  }
}

// ==========================================
// 模擬智能體 (Mock Agents)
// ==========================================

/**
 * 模擬的 WorkerAgent，繼承自 BaseAgent
 * 用於在註冊表中進行註冊，並能分配特定能力
 */
class MockWorkerAgent extends BaseAgent {
  constructor(id: string, role: string, capabilities: string[]) {
    super();
    // 直接設置屬性，避免在構造函數中呼叫 async 的 initFromJSON
    this._id = id;
    this._role = role;
    this._capabilities = capabilities;
  }
}

// ==========================================
// 整合測試 (Integration Test)
// ==========================================

describe('SuperNova End-to-End Integration Test', () => {
  beforeEach(() => {
    // 由於 GlobalRuntime 依賴 setTimeout/setInterval，我們使用 Fake Timers 來精確控制時間流逝
    jest.useFakeTimers();
  });

  afterEach(() => {
    // 測試結束後還原計時器與所有 mock 函數
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should initialize environment, register components, and execute tasks in DAG order', async () => {
    // ----------------------------------------------------
    // 1. 環境初始化 (Environment Initialization)
    // ----------------------------------------------------
    const eventBus = new EventBus();
    const agentRegistry = new AgentRegistry();
    const toolRegistry = new ToolRegistry();
    const sessionManager = new SessionManager();
    // 設置 Runtime，並手動注入 Mock Config
    const runtime = new GlobalRuntime(sessionManager, eventBus);
    runtime.config = {
      runtime: {
        tick_rate_ms: 100,
        max_active_sessions: 10
      }
    } as any;

    // ----------------------------------------------------
    // 2. 工具註冊 (Tool Registration)
    // ----------------------------------------------------
    const searchTool = new MockSearchTool();
    const summarizeTool = new MockSummarizeTool();
    toolRegistry.register(searchTool);
    toolRegistry.register(summarizeTool);

    // 驗證工具成功註冊
    expect(toolRegistry.getTool('SearchTool')).toBeDefined();
    expect(toolRegistry.getTool('SummarizeTool')).toBeDefined();

    // ----------------------------------------------------
    // 3. Agent 註冊 (Agent Registration)
    // ----------------------------------------------------
    const searchAgent = new MockWorkerAgent('agent-search', 'Searcher', ['SEARCH']);
    const summarizeAgent = new MockWorkerAgent('agent-summarize', 'Summarizer', ['SUMMARIZE']);
    agentRegistry.register(searchAgent);
    agentRegistry.register(summarizeAgent);

    // 驗證 Agent 成功註冊
    expect(agentRegistry.getAgent('agent-search')).toBeDefined();
    expect(agentRegistry.getAgent('agent-summarize')).toBeDefined();

    // ----------------------------------------------------
    // 4. Session 與 DAG 設置 (Session and TaskGraph Setup)
    // ----------------------------------------------------
    // 創建會話
    const session = await sessionManager.createFromJSON({ 
      id: 'e2e-test-session', 
      goal: 'Execute search and summarize pipeline' 
    }) as BaseSession;
    
    // 在會話的任務圖 (TaskGraph) 中添加兩個任務節點
    session.taskGraph.addTask('TaskA', { tool: 'SearchTool' });
    session.taskGraph.addTask('TaskB', { tool: 'SummarizeTool' });
    
    // 建立依賴關係: TaskA -> TaskB
    // 這表示 TaskB 必須等待 TaskA 完成後才能開始執行
    session.taskGraph.addDependency('TaskA', 'TaskB');

    // 為了驗證執行順序，我們攔截 console.log
    // 因為在 BaseSession.tick() 內部會打印 "[BaseSession] Executing task: <id>"
    const logSpy = jest.spyOn(console, 'log');

    // ----------------------------------------------------
    // 5. 啟動與驗證 (Start and Verification)
    // ----------------------------------------------------
    // 啟動全局運行時 (將開始計時器)
    await runtime.start();

    // 推進時間 100ms，觸發第一次 tick
    jest.advanceTimersByTime(100);
    // 等待所有微任務 (Microtasks) 處理完畢，確保 async 函數執行完成
    await Promise.resolve();
    
    // 驗證 TaskA (入度為 0) 已被執行
    expect(logSpy).toHaveBeenCalledWith('[BaseSession] Executing task: TaskA');
    // 此時 TaskB 的前置任務剛完成，TaskB 剛被加入 ReadyQueue，尚未在本次 tick 中執行
    expect(logSpy).not.toHaveBeenCalledWith('[BaseSession] Executing task: TaskB');

    // 清除日誌記錄以便進行下一步驗證
    logSpy.mockClear();

    // 推進時間 100ms，觸發第二次 tick
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    // 驗證 TaskB 在依賴解除後被執行
    expect(logSpy).toHaveBeenCalledWith('[BaseSession] Executing task: TaskB');

    // 清理資源並停止運行時
    await runtime.stop();
  });
});
