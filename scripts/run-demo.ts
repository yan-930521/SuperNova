import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { SessionManager } from '../src/infra/SessionManager';
import { EventBus } from '../src/infra/EventBus';
import { AgentRegistry } from '../src/infra/AgentRegistry';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import { BaseAgent } from '../src/agent/BaseAgent';
import { BaseTool } from '../src/tool/BaseTool';

// 1. 建立一個模擬的工具 (Mock Tool)
class WebSearchTool extends BaseTool<string, string> {
  constructor() {
    super('WebSearch', 'Search the web for information', 'TIER_1', ['SEARCH']);
  }
  async run(input: string): Promise<string> {
    console.log(`\n🔍 [WebSearchTool] 正在搜尋: "${input}"...`);
    await new Promise(resolve => setTimeout(resolve, 800)); // 模擬網路延遲
    console.log(`✅ [WebSearchTool] 找到結果!`);
    return `Results for ${input}: SuperNova is awesome.`;
  }
}

// 2. 建立一個模擬的分析工具 (Mock Tool)
class AnalyzeTool extends BaseTool<string, string> {
  constructor() {
    super('Analyze', 'Analyze data', 'TIER_1', ['ANALYZE']);
  }
  async run(input: string): Promise<string> {
    console.log(`\n🧠 [AnalyzeTool] 正在分析數據...`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 模擬計算延遲
    console.log(`✅ [AnalyzeTool] 分析完成!`);
    return `Analysis: The data indicates success.`;
  }
}

async function runDemo() {
  console.log("🚀 [SuperNova Demo] 正在初始化系統核心組件...\n");

  // 初始化基礎設施
  const eventBus = new EventBus();
  const sessionManager = new SessionManager();
  const agentRegistry = new AgentRegistry();
  const toolRegistry = new ToolRegistry();
  const runtime = new GlobalRuntime(sessionManager, eventBus);

  // 註冊工具
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new AnalyzeTool());

  // 初始化並註冊 Agent
  const searchAgent = new BaseAgent();
  await searchAgent.initFromJSON({ id: 'agent-007', role: 'Researcher', capabilities: ['SEARCH'] });
  agentRegistry.register(searchAgent);

  const analystAgent = new BaseAgent();
  await analystAgent.initFromJSON({ id: 'agent-008', role: 'Analyst', capabilities: ['ANALYZE'] });
  agentRegistry.register(analystAgent);

  // 建立 Session
  const session = await sessionManager.createFromJSON({
    id: 'demo-session',
    goal: 'Research latest AI trends and analyze them'
  });

  // 手動構造 TaskGraph (模擬 CoordinatorAgent 的工作)
  const taskGraph = (session as any).taskGraph;
  taskGraph.addTask('Task_Search', { tool: 'WebSearch', input: 'AI trends 2026' });
  taskGraph.addTask('Task_Analyze', { tool: 'Analyze', input: 'search_results' });
  taskGraph.addDependency('Task_Search', 'Task_Analyze'); // Analyze 必須等 Search 完成

  console.log("\n▶️ [SuperNova Demo] 啟動全局運行時 (GlobalRuntime)...");
  await runtime.start();

  // 監控系統狀態，當沒有活躍任務時自動停止
  // 為了這個 Demo，我們手動觸發任務執行邏輯 (原本應由 Session.tick 內部與 Agent 互動處理)
  
  // 攔截 BaseSession 的 tick 以注入自定義的展示邏輯 (因為我們沒有實作真正的 Agent 推理大腦)
  const originalTick = session.tick.bind(session);
  (session as any).tick = async () => {
    await originalTick();
    
    // 檢查 ReadyQueue 看看有沒有可以執行的任務
    const readyQueue = (session as any).readyQueue;
    const nextTask = readyQueue.pop();
    
    if (nextTask) {
        console.log(`\n⚡ [系統調度] 發現就緒任務: [${nextTask}]，開始分派執行...`);
        
        if (nextTask === 'Task_Search') {
            const tool = toolRegistry.getTool('WebSearch');
            await tool!.run('AI trends 2026');
            (session as any).scheduler.onTaskCompleted(nextTask, taskGraph, readyQueue);
        } else if (nextTask === 'Task_Analyze') {
            const tool = toolRegistry.getTool('Analyze');
            await tool!.run('search_results');
            (session as any).scheduler.onTaskCompleted(nextTask, taskGraph, readyQueue);
            
            // 任務鏈執行完畢，停止系統
            console.log("\n🎉 [SuperNova Demo] 所有任務執行完畢！");
            await runtime.stop();
            process.exit(0);
        }
    }
  };
}

runDemo().catch(console.error);
