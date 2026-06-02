import { ITool } from './BaseTool';

/**
 * ToolRegistry (工具註冊表)
 * 職責：集中管理系統中所有可用的工具實例。
 * 特點：不硬編碼具體工具，透過依賴注入或動態註冊填充。
 */
export class ToolRegistry {
  private tools: Map<string, ITool> = new Map();

  /**
   * 註冊一個或多個工具
   */
  public register(tool: ITool | ITool[]): void {
    if (Array.isArray(tool)) {
      tool.forEach(t => this.tools.set(t.name, t));
    } else {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * 根據名稱獲取工具
   */
  public getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * 獲取所有工具
   */
  public getAllTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 根據類別獲取工具 (例如 'core', 'common', 'file')
   * 實現動態過濾，不依賴硬編碼名稱清單。
   */
  public getToolsByCategory(category: string): ITool[] {
    return this.getAllTools().filter(t => t.category === category);
  }

  /**
   * 獲取多個類別的聯集工具
   */
  public getToolsByCategories(categories: string[]): ITool[] {
    return this.getAllTools().filter(t => categories.includes(t.category));
  }

  /**
   * 註冊 SuperNova 所有的標準預設工具
   * 透過此方法集中管理工具的實例化，解決 Agent 循環依賴問題。
   */
  public registerStandardTools(): void {
    // 使用 require 避開加載時的循環引用
    const { GoalDispatcherTool } = require('./core/GoalDispatcherTool');
    const { TaskInfoTool } = require('./core/TaskInfoTool');
    const { ChainInfoTool } = require('./core/ChainInfoTool');
    
    const { DeepThinkingTool } = require('./common/DeepThinkingTool');
    const { TavilySearchTool } = require('./common/TavilySearchTool');
    const { WebFetchTool } = require('./common/WebFetchTool');
    const { TimeTool } = require('./common/TimeTool');
    const { SystemInfoTool } = require('./common/SystemInfoTool');
    const { MathTool } = require('./common/MathTool');
    const { UnitConverterTool } = require('./common/UnitConverterTool');
    const { CodeExecutorTool } = require('./common/CodeExecutorTool');
    const { TextSummarizerTool } = require('./common/TextSummarizerTool');
    
    const { WriteFileTool } = require('./file/WriteFileTool');
    const { ReadFileTool } = require('./file/ReadFileTool');
    const { ListFilesTool } = require('./file/ListFilesTool');
    const { DeleteFileTool } = require('./file/DeleteFileTool');

    // Context Tools (Blackboard)
    const { PostFactTool } = require('./context/PostFactTool');
    const { PostHypothesisTool } = require('./context/PostHypothesisTool');
    const { PostDecisionTool } = require('./context/PostDecisionTool');
    const { PostOpenQuestionTool } = require('./context/PostOpenQuestionTool');
    const { ContextVariableTool } = require('./context/ContextVariableTool');

    this.register([
      new DeepThinkingTool(),
      new GoalDispatcherTool(), new TaskInfoTool(), new ChainInfoTool(),
      new TavilySearchTool(), new WebFetchTool(),
      new TimeTool(), new SystemInfoTool(), new MathTool(),
      new UnitConverterTool(), new CodeExecutorTool(), new TextSummarizerTool(),
      new WriteFileTool(), new ReadFileTool(), new ListFilesTool(), new DeleteFileTool(),
      new PostFactTool(), new PostHypothesisTool(), new PostDecisionTool(), new PostOpenQuestionTool(), new ContextVariableTool()
    ]);
  }
}
