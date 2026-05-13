import { z } from 'zod';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { ITool } from '../../interfaces/tool/ITool';
import { BaseAgent } from './BaseAgent';

import type { IWorkerAgent } from '../../interfaces/agent/IWorkerAgent';
import type { IReasoningBehavior } from '../../interfaces/agent/IReasoningBehavior';
import type { IToolRegistry } from '../../interfaces/infra/IToolRegistry';
import type { IAgentState } from '../../interfaces/agent/IAgentState';
import type { ITaskNode } from '../../interfaces/agent/ITaskPlanEngine';
import type { IModelRegistry } from '../../interfaces/runtime/IModelRegistry';
/**
 * WorkerAgent 類
 * 負責接收任務，直接利用 LangGraph 內建的 ReAct 模式執行任務。
 * 支持並行執行多個來自不同會話的任務。
 */
export class WorkerAgent extends BaseAgent implements IWorkerAgent {
  protected reasoner?: IReasoningBehavior;
  private activeTasks: Set<Promise<any>> = new Set();

  constructor(
    protected toolRegistry?: IToolRegistry,
    protected modelRegistry?: IModelRegistry
  ) {
    super();
  }

  /**
   * 初始化 WorkerAgent
   * @param config 來自 JSON 的配置
   */
  async initFromJSON(config: Record<string, any>): Promise<void> {
    await super.initFromJSON(config);
    console.log(`[WorkerAgent ${this.id}] 初始化完成。`);
  }

  /**
   * 處理來自 TaskGraph 的任務節點 (直接執行)
   * 透過 async 不等待實現潛在的並行支持，但由調用者控制等待。
   * @param taskNode 任務節點數據
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
   * 內部的任務執行邏輯，使用 LangGraph ReAct 實作
   * @param taskNode 任務節點
   */
  protected async executeTaskInternal(taskNode: ITaskNode): Promise<any> {
    if (!this.modelRegistry || !this.toolRegistry) {
      // 若未配置 modelRegistry 或 toolRegistry，則嘗試直接根據 taskNode.type 執行工具 (退化模式)
      return this.fallbackExecution(taskNode);
    }

    // 1. 獲取模型與工具
    const model = this.modelRegistry.getRawModel(ModelPreset.SMART) as BaseChatModel;
    const tools = this.toolRegistry.listTools().map((t: ITool) => tool(
      async (input) => {
        const context = {
          sessionId: taskNode.metadata?.sessionId || 'unknown',
          agentId: this.id,
          traceId: `trace-${Date.now()}`
        };
        return await t.run(input, context);
      },
      {
        name: t.name,
        description: t.description,
        schema: t.schema || z.any()
      }
    ));

    // 2. 創建 ReAct Agent
    const agent = createReactAgent({
      llm: model,
      tools: tools,
      // 使用 identity 作為系統提示詞的前綴
      messageModifier: this.identity || `You are a helpful worker agent specialized in ${this.role}.`
    });

    // 3. 構建思考上下文
    const state: IAgentState = this.createTaskState(taskNode);
    
    // 4. 執行 Agent
    console.log(`[WorkerAgent ${this.id}] 正在利用 ReAct 模式執行任務: ${taskNode.goal}`);
    // 準備訊息：若無歷史訊息，則將 goal 作為第一條 HumanMessage
    const messages = state.messages.length > 0 
      ? state.messages 
      : [new HumanMessage(state.goal)];

    const resultState = await agent.invoke({
      messages: messages
    });

    // 5. 返回最後一條消息的內容作為結果
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
   * 當無 ModelRegistry 時的保底執行邏輯
   */
  protected async fallbackExecution(taskNode: ITaskNode): Promise<any> {
    if (!this.toolRegistry) {
      throw new Error(`WorkerAgent ${this.id} 未配置 ToolRegistry，無法執行任務。`);
    }
    const tool = this.toolRegistry.getTool(taskNode.type);
    if (tool) {
      console.log(`[WorkerAgent ${this.id}] [保底模式] 直接執行工具: ${taskNode.type}`);
      return await tool.run(taskNode.metadata?.data || {}, {
        sessionId: taskNode.metadata?.sessionId || 'unknown',
        agentId: this.id,
        traceId: `trace-${Date.now()}`
      });
    }
    throw new Error(`無可用 ModelRegistry 且找不到保底工具: ${taskNode.type}`);
  }

  /**
   * 獲取當前正在執行的任務數量 (用於監控並行度)
   */
  get activeTaskCount(): number {
    return this.activeTasks.size;
  }
}
