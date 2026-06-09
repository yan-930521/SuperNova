import { ContextService } from '../../application/context/ContextService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { BaseAgent } from '../BaseAgent';
import { MemoryService } from '../../application/memory/MemoryService';
import { PromptLoader } from '../../utils/PromptLoader';
import { IdGenerator } from '../../utils/IdGenerator';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * DoingAgent (行動者) - SuperNova 0.4.0
 * 職責: 執行具體任務節點，透過 LangChain 原生的 ReAct 機制呼叫工具。
 */
export class DoingAgent extends BaseAgent {
  private identityPrompt: string;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.identityPrompt = PromptLoader.load('prompts/identity/doing_agent.md');
    // 初始化 ReAct 執行器
    this.buildExecutionEngine(ModelPreset.FAST);
  }

  protected setupSubscriptions(): void {
    // 監聽任務執行啟動事件
    this.bus.subscribe(AgentEvents.Doing.Start, this.onDoingStart.bind(this));
  }

  /**
   * 處理執行啟動：開啟 ReAct 思考循環
   */
  private async onDoingStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId, goal, content } = event.payload;
    this.log(`Task execution started for node: ${taskId}`, 'info', { traceId, sessionId });

    try {
      if (!this.reactAgent) {
        throw new Error("ReAct Engine is not initialized.");
      }

      const contextService = this.runtime.container.resolve<ContextService>('ContextService');
      const memoryService = this.runtime.container.resolve<MemoryService>('MemoryService');

      // 1. 初始化會話上下文：獲取當前黑板已有的 Keys 指針
      const blackboardKeys = await memoryService.getL1Index(sessionId);

      // 2. 準備系統提示詞
      const systemPrompt = contextService.renderPrompt('DoingAgent', event.payload, blackboardKeys);
      const finalSystemPrompt = `${this.identityPrompt}\n\n${systemPrompt}`;

      // 3. 準備給 LLM 的輸入任務說明
      const inputMsg = `
Goal: ${goal || 'Execute assigned task'}
Task ID: ${taskId}
Task Details:
${content || 'No specific details provided.'}
`;

      this.updateHeartbeat(taskId!);

      // 4. 透過 RunnableConfig 傳遞 context 給底層工具
      const config = {
        configurable: {
          toolContext: {
            sessionId,
            traceId,
            agentId: this.id,
            metadata: { taskId }
          }
        }
      };

      // 5. 執行原生 ReAct 迴圈
      const result = await this.reactAgent.invoke({
        messages: [
          new SystemMessage(finalSystemPrompt),
          new HumanMessage(inputMsg)
        ]
      }, config);

      // 解析最後一個 AI 訊息作為結果
      const finalAnswer = result.messages[result.messages.length - 1].content;

      this.log(`Node ${taskId} completed with answer.`, 'info', { traceId, sessionId });
      
      // 6. 最終產出存入黑板，供後續階段 (Checking) 使用
      await this.postToL1(
        sessionId, 
        `final_result_${taskId}`, 
        finalAnswer, 
        `Final answer for task node ${taskId}`
      );

      // 7. 發布完成事件
      this.bus.publish({
        type: AgentEvents.Doing.Finish,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'da'),
          taskId, 
          content: finalAnswer
        }
      });

    } catch (error) {
      this.log(`Critical execution error: ${error}`, 'error', { traceId, sessionId });
      
      // 回報失敗，觸發自癒流程
      this.bus.publish({
        type: AgentEvents.Doing.Fail,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'da'),
          taskId, 
          error: String(error)
        }
      });
    }
  }
}
