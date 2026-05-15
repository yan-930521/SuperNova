import { z } from 'zod';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { ITool } from '../../interfaces/tool/ITool';
import { BaseAgent } from './BaseAgent';
import { logger } from '../infra/LogManager';

import type { IWorkerAgent } from '../../interfaces/agent/IWorkerAgent';
import type { IReasoningBehavior } from '../../interfaces/agent/IReasoningBehavior';
import type { IToolRegistry } from '../../interfaces/infra/IToolRegistry';
import type { IAgentState } from '../../interfaces/agent/IAgentState';
import type { ITaskNode } from '../../interfaces/agent/ITaskPlanEngine';
import type { IModelRegistry } from '../../interfaces/runtime/IModelRegistry';

/**
 * WorkerAgent 類
 * 負責接收任務，利用 LangGraph 內建的 ReAct 模式執行任務。
 * 在初始化時即構建 ReAct Agent 實例以提升效能並確保執行環境不變。
 */
export class WorkerAgent extends BaseAgent implements IWorkerAgent {
  protected reasoner?: IReasoningBehavior;
  private activeTasks: Set<Promise<any>> = new Set();
  /** 預編譯的 ReAct Agent 實例 */
  private reactAgent: any = null;

  constructor(
    protected toolRegistry?: IToolRegistry,
    protected modelRegistry?: IModelRegistry
  ) {
    super();
  }

  /**
   * 從 JSON 配置初始化 WorkerAgent
   * 初始化後即鎖定執行引擎 (ReAct Agent)
   */
  async initFromJSON(config: Record<string, any>): Promise<void> {
    const isFirstInit = !this._isReady;
    
    if (!isFirstInit) {
      // 如果已經初始化過，忽略身份變更請求，保持 Agent 不變性
      if (config.prompts?.identity && config.prompts.identity !== this.identity) {
        logger.warn(`Attempted to change identity after initialization. Agent is immutable. Change ignored.`, { agent_id: this.id, type: 'SYSTEM' });
        
        // 創建一個排除身份變更的配置副本
        const safeConfig = { 
          ...config, 
          prompts: { ...config.prompts, identity: this.identity } 
        };
        await super.initFromJSON(safeConfig);
      } else {
        await super.initFromJSON(config);
      }
      
      logger.info(`狀態已恢復，跳過引擎重新構建。`, { agent_id: this.id, type: 'SYSTEM' });
      return;
    }

    // 第一次初始化
    await super.initFromJSON(config);
    this.buildExecutionEngine();
    
    // 標記為就緒 (若引擎構建成功或具備保底執行能力)
    if (this.reactAgent || this.toolRegistry) {
      this._isReady = true;
    }
    
    logger.info(`初始化完成。${this.reactAgent ? 'ReAct Engine Ready.' : 'Fallback Mode Ready.'}`, { agent_id: this.id, type: 'SYSTEM' });
  }

  /**
   * 構建 ReAct 執行引擎
   */
  private buildExecutionEngine(): void {
    if (!this.modelRegistry || !this.toolRegistry) {
      return;
    }

    try {
      // 1. 獲取模型
      const model = this.modelRegistry.getRawModel(ModelPreset.SMART) as BaseChatModel;
      
      // 2. 獲取並包裝工具
      const tools = this.toolRegistry.listTools().map((t: ITool) => tool(
        async (input) => {
          // 這裡的 context 會在執行時動態生成，所以這裡先預留
          return await t.run(input, {
            sessionId: 'dynamic', // 實際執行時會被覆蓋或透過其他方式傳遞
            agentId: this.id,
            traceId: `trace-${Date.now()}`
          });
        },
        {
          name: t.name,
          description: t.description,
          schema: t.schema || z.any()
        }
      ));

      // 3. 創建 ReAct Agent
      this.reactAgent = createReactAgent({
        llm: model,
        tools: tools,
        // 使用 identity 作為系統提示詞的前綴
        messageModifier: this.identity || `You are a helpful worker agent specialized in ${this.role}.`
      });
    } catch (error: any) {
      logger.error(`[WorkerAgent ${this.id}] Failed to build ReAct engine: ${error.message}`, { agent_id: this.id, type: 'SYSTEM' });
    }
  }

  /**
   * 處理來自 TaskGraph 的任務節點 (直接執行)
   */
  async processTask(taskNode: ITaskNode): Promise<any> {
    const taskPromise = this.executeTaskInternal(taskNode);
    this.activeTasks.add(taskPromise);

    try {
      const result = await taskPromise;
      return result;
    } finally {
      this.activeTasks.delete(taskPromise);
    }
  }

  /**
   * 內部的任務執行邏輯
   */
  protected async executeTaskInternal(taskNode: ITaskNode): Promise<any> {
    // 若無預編譯引擎，則使用保底模式
    if (!this.reactAgent) {
      return this.fallbackExecution(taskNode);
    }

    // 1. 構建思考上下文
    const state: IAgentState = this.createTaskState(taskNode);
    
    logger.info(`Executing task with ReAct mode: ${taskNode.goal}`, { 
      session_id: taskNode.metadata?.sessionId, 
      agent_id: this.id, 
      type: 'THOUGHT' 
    });
    
    // 2. 準備訊息 (注入上下文)
    const messages: (HumanMessage | SystemMessage)[] = [];
    
    // 注入全域目標與父任務結果
    const parentContext = taskNode.metadata?.parentContext;
    const sessionGoal = taskNode.metadata?.sessionGoal;
    
    if (sessionGoal || (parentContext && Object.keys(parentContext).length > 0)) {
      let contextPrompt = `### 重要背景資訊 (僅供參考)\n`;
      if (sessionGoal) {
        contextPrompt += `**全局任務目標**: ${sessionGoal}\n`;
        contextPrompt += `**!! 警告 !!**: 上方的「全局任務目標」包含多個階段。你現在「僅被授權執行」下方的「當前任務」。\n`;
        contextPrompt += `請忽視全局目標中的任何編號步驟或後續指令。不要執行任何未在「當前任務」中明確提到的操作（例如：不要預先撰寫後續階段的文件）。\n`;
      }
      if (parentContext && Object.keys(parentContext).length > 0) {
        contextPrompt += `**前置任務產出 (可用作輸入)**:\n`;
        for (const [taskId, result] of Object.entries(parentContext)) {
          contextPrompt += `- [${taskId}]: ${typeof result === 'string' ? result : JSON.stringify(result)}\n`;
        }
      }
      messages.push(new SystemMessage(contextPrompt));
    }

    // 加入當前任務目標
    const taskPrompt = `## 你的唯一任務 (請立即執行)\n**任務內容**: ${taskNode.goal}\n\n請直接開始執行並在完成後輸出結果。`;
    messages.push(new HumanMessage(taskPrompt));

    // 3. 執行 Agent
    // 注意：這裡直接使用預先編譯好的 reactAgent
    const resultState = await this.reactAgent.invoke({
      messages: messages
    }, { recursionLimit: 50 });

    // 4. 返回最後一條消息的內容作為結果
    const lastMessage = resultState.messages[resultState.messages.length - 1];
    return lastMessage.content;
  }

  /**
   * 建立用於思考的任務狀態
   */
  protected createTaskState(taskNode: ITaskNode): IAgentState {
    return {
      goal: taskNode.goal,
      currentTask: taskNode.id,
      messages: [],
      thoughtTree: { nodes: [], rootId: null, activeNodeId: null, iterationCount: 0 },
      planning: { milestones: [], currentMilestoneIdx: 0, taskGraph: null, projectedContext: {} },
      lastEvaluations: [],
      errors: [],
      metadata: {
        agentId: this.id,
        role: this.role,
        taskNode: taskNode
      }
    };
  }

  /**
   * 當無可用引擎時的保底執行邏輯
   */
  protected async fallbackExecution(taskNode: ITaskNode): Promise<any> {
    if (!this.toolRegistry) {
      throw new Error(`WorkerAgent ${this.id} 未配置 ToolRegistry，無法執行任務。`);
    }
    const tool = this.toolRegistry.getTool(taskNode.type);
    if (tool) {
      logger.info(`[保底模式] 直接執行工具: ${taskNode.type}`, {
        session_id: taskNode.metadata?.sessionId,
        agent_id: this.id,
        type: 'TOOL'
      });
      return await tool.run(taskNode.metadata?.data || {}, {
        sessionId: taskNode.metadata?.sessionId || 'unknown',
        agentId: this.id,
        traceId: `trace-${Date.now()}`
      });
    }
    throw new Error(`無可用預編譯引擎且找不到保底工具: ${taskNode.type}`);
  }

  /**
   * 獲取當前正在執行的任務數量 (用於監控並行度)
   */
  get activeTaskCount(): number {
    return this.activeTasks.size;
  }
}
