import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tool as langChainTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { RecordAction, recorder } from '../infra/LogManager';
import { ModelPreset } from '../infra/ModelRegistry';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { IAgentExecuteContext, IAgentExecuteResult } from '../task/types';
import { ITool } from '../tool/BaseTool';
import { CodeExecutorTool } from '../tool/common/CodeExecutorTool';
import { MathTool } from '../tool/common/MathTool';
import { SystemInfoTool } from '../tool/common/SystemInfoTool';
import { TavilySearchTool } from '../tool/common/TavilySearchTool';
import { TextSummarizerTool } from '../tool/common/TextSummarizerTool';
import { TimeTool } from '../tool/common/TimeTool';
import { UnitConverterTool } from '../tool/common/UnitConverterTool';
import { WebFetchTool } from '../tool/common/WebFetchTool';
import { AgentListTool } from '../tool/core/AgentListTool';
import { AgentRegisterTool } from '../tool/core/AgentRegisterTool';
import { DeepThinkingTool } from '../tool/core/DeepThinkingTool';
import { TaskAssignTool } from '../tool/core/TaskAssignTool';
import { TaskCreateTool } from '../tool/core/TaskCreateTool';
import { TaskDispatcherTool } from '../tool/core/TaskDispatcherTool';
import { TaskInfoTool } from '../tool/core/TaskInfoTool';
import { TaskListTool } from '../tool/core/TaskListTool';
import { DeleteFileTool } from '../tool/file/DeleteFileTool';
import { ListFilesTool } from '../tool/file/ListFilesTool';
import { ReadFileTool } from '../tool/file/ReadFileTool';
import { WriteFileTool } from '../tool/file/WriteFileTool';
import { PromptLoader } from '../utils/PromptLoader';

/**
 * BaseAgent (代理基類)
 * 2.0 版：所有代理均內建 ReAct 執行引擎，具備獨立思考與工具調用能力。
 */
export abstract class BaseAgent {
  public identity: string = '';
  public capabilities: string[] = [];
  /** 可調用的代理白名單 (ID 列表) */
  public availableAgents: string[] = [];
  protected _config: Record<string, any> = {};
  /** 代理的工具箱 */
  protected tools = new Map<string, ITool>();
  /** 預編譯的 ReAct 執行引擎 */
  protected reactAgent: any = null;

  constructor(public id: string, public role: string) {
    // 預設註冊所有工具
    this.registerDefaultTools();
  }
  
  /**
   * 註冊工具
   */
  protected registerTool(tool: ITool) {
    this.tools.set(tool.name, tool);
  }

  /**
   * 註冊系統所有預設工具
   */
  protected registerDefaultTools(): void {
    // 1. 核心編排與查詢工具    
    this.registerTool(new DeepThinkingTool());

    // 2. 外部能力工具
    this.registerTool(new TavilySearchTool());
    this.registerTool(new WebFetchTool());
    
    // 3. 通用公用工具
    this.registerTool(new TimeTool());
    this.registerTool(new SystemInfoTool());
    this.registerTool(new MathTool());
    this.registerTool(new UnitConverterTool());
    this.registerTool(new CodeExecutorTool());
    this.registerTool(new TextSummarizerTool());
    
    // 4. 檔案操作工具
    this.registerTool(new WriteFileTool());
    this.registerTool(new ReadFileTool());
    this.registerTool(new ListFilesTool());
    this.registerTool(new DeleteFileTool());
  }

  /**
   * 初始化執行引擎
   */
  public buildExecutionEngine(): void {
    try {
      const runtime = GlobalRuntime.getInstance();
      const model = runtime.modelRegistry.getRawModel(ModelPreset.SMART) as BaseChatModel;

      // 將 SuperNova BaseTool 包裝為 LangChain 原生工具
      const nativeTools = Array.from(this.tools.values()).map(t => langChainTool(
        async (input, config) => {
          const context = config.configurable?.toolContext || {
            sessionId: 'unknown',
            agentId: this.id,
            traceId: `trace-${Date.now()}`
          };
          // 確保 context 中包含 agentId
          const executeContext: IAgentExecuteContext = {
            ...context,
            agentId: context.agentId || this.id
          };
          return await (t as any).execute(input, executeContext);
        },
        {
          name: t.name,
          description: t.description,
          schema: t.schema
        }
      ));

      // 建立預編譯 ReAct Agent
      this.reactAgent = createReactAgent({
        llm: model,
        tools: nativeTools,
        messageModifier: (this.identity || `你是一個 AI 代理 (${this.id})。你的角色是 ${this.role}。`)
      });

      recorder.info(`Agent [${this.id}] ReAct Engine built successfully.`, { type: 'SYSTEM' });
    } catch (error: any) {
      recorder.error(`Failed to build execution engine for Agent [${this.id}]: ${error.message}`);
    }
  }

  /**
   * 核心執行方法：使用 ReAct 引擎執行任務。
   * 適用於所有繼承自 BaseAgent 的代理。
   */
  async execute(taskGoal: string, context: IAgentExecuteContext): Promise<IAgentExecuteResult> {
    const { sessionId, traceId } = context;
    const runtime = GlobalRuntime.getInstance();
    
    if (!this.reactAgent) {
      this.buildExecutionEngine();
    }

    const session = runtime.sessionManager.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    recorder.record(RecordAction.TOOL_CALL, `Agent [${this.id}] starting ReAct execution for: ${taskGoal}`, {
      session_id: sessionId,
      agent_id: this.id,
      trace_id: traceId
    });

    try {
      // 執行 ReAct 引擎
      // 我們將任務目標包裝為指令輸入
      const resultState = await this.reactAgent.invoke({
        messages: [
          ...session.history,
          { role: 'user', content: `[DIRECTIVE]: 你當前的任務目標是「${taskGoal}」。請直接開始執行並回報結果。` }
        ]
      }, {
        recursionLimit: 50,
        configurable: {
          toolContext: context
        }
      });

      // 獲取產出
      const lastMessage = resultState.messages[resultState.messages.length - 1];
      const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

      recorder.record(RecordAction.STATE_MUTATION, `Agent [${this.id}] finished task: ${taskGoal}`, {
        session_id: sessionId,
        agent_id: this.id,
        trace_id: traceId,
        payload: { content }
      });

      return { 
        status: 'success',
        result: { data: content }, 
        summary: content 
      };

    } catch (error: any) {
      recorder.error(`Agent [${this.id}] execution failed: ${error.message}`, { session_id: sessionId, trace_id: traceId });
      return { 
        status: 'failed',
        result: null,
        error: error.message,
        summary: `執行任務失敗: ${error.message}` 
      };
    }
  }

  /**
   * 從 JSON 配置初始化或恢復 Agent 狀態
   */
  async initFromJSON(config: Record<string, any>): Promise<void> {
    const resolvedConfig = await PromptLoader.resolvePrompts(config);
    
    const { id, role, capabilities, availableAgents, prompts, ...rest } = resolvedConfig;
    
    if (id) this.id = id;
    if (role) this.role = role;
    if (capabilities) this.capabilities = capabilities;
    if (availableAgents) this.availableAgents = availableAgents;
    if (prompts?.identity) this.identity = prompts.identity;
    
    this._config = {
      ...this._config,
      ...rest,
      prompts: prompts || this._config.prompts
    };
  }

  /**
   * 將 Agent 當前狀態序列化為 JSON
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      role: this.role,
      capabilities: this.capabilities,
      availableAgents: this.availableAgents,
      prompts: {
        identity: this.identity
      },
      ...this._config,
    };
  }
}
