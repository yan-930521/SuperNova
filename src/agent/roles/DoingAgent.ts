import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { ContextService } from '../../application/context/ContextService';
import { MemoryService } from '../../application/memory/MemoryService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { IdGenerator } from '../../utils/IdGenerator';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseAgent } from '../BaseAgent';

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
    this.bus.subscribe(AgentEvents.Phase.Start, (e) => {
      if (e.payload.phase === 'DOING') {
        this.onStart(e);
      }
    });
  }

  /**
   * 處理執行啟動：開啟 ReAct 思考循環
   */
  private async onStart(event: AgentEvent): Promise<void> {    
    const { sessionId, traceId, taskId, content } = event.payload;
    this.log(`Task execution started for node: ${taskId}`, 'info', { traceId, sessionId });

    try {
      if (!this.reactAgent) {
        throw new Error("ReAct Engine is not initialized.");
      }

      // 1 & 2. 準備系統提示詞 (包含 Identity 貫通與黑板上下文)
      const finalSystemPrompt = await this.getSystemPrompt(this.identityPrompt, event.payload);

      // 3. 準備給 LLM 的輸入任務說明
      const inputMsg = `
Goal: ${content || 'Execute assigned task'}
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
        type: AgentEvents.Phase.Finish,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'da'),
          taskId, 
          phase: 'DOING',
          content: finalAnswer
        }
      });

    } catch (error) {
      this.log(`Critical execution error: ${error}`, 'error', { traceId, sessionId });
      
      // 回報失敗，觸發自癒流程
      this.bus.publish({
        type: AgentEvents.Phase.Fail,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'da'),
          taskId, 
          phase: 'DOING',
          error: String(error)
        }
      });
    }
  }
}
