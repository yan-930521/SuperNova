import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { SessionService } from '../../application/session/SessionService';
import {
    AgentEvent, AgentEvents, IAgentEventPayload, IEventBus, SystemEvents
} from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { MessageRole } from '../../infra/types/session';
import { IdGenerator } from '../../utils/IdGenerator';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseAgent } from '../BaseAgent';

/**
 * PersonaAgent (虛擬人格代理)
 * 職責: 掌管與人類的交互門戶，具備獨立人格，並能指揮後台 SA 執行任務。
 */
export class PersonaAgent extends BaseAgent {
  private identityPrompt: string;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    // 讀取人格設定
    this.identityPrompt = PromptLoader.load('prompts/identity/persona_agent.md');
    
    // 初始化 ReAct 執行器，具備完整的對話與工具能力
    this.buildExecutionEngine(ModelPreset.SMART);
  }

  protected setupSubscriptions(): void {
    // 攔截原本發給 SA 的 Chat 事件
    this.bus.subscribe(AgentEvents.Control.Chat, (e) => this.onChat(e));
    
    // 監聽任務完成事件，通知人類
    this.bus.subscribe(SystemEvents.Task.Finished, (e) => this.onTaskFinished(e));
  }

  /**
   * 當後台任務完成時，夏沫主動向人類回報
   */
  private async onTaskFinished(event: AgentEvent): Promise<void> {
    const { sessionId, taskId, content } = event.payload;
    const traceId = event.payload.traceId || IdGenerator.trace();

    this.log(`[Persona] Task ${taskId} finished. Preparing report.`, 'info', { traceId, sessionId });

    try {
      const sessionService = this.runtime.container.resolve<SessionService>('SessionService');
      const session = await sessionService.getOrCreateSession(sessionId);

      // 1. 準備系統提示詞
      const systemPrompt = await this.getSystemPrompt(this.identityPrompt, event.payload);
      
      console.log("------", systemPrompt, "------")

      // 2. 準備輸入，告訴夏沫任務完成了，請她用自己的口氣回報
      const inputMsg = `
通知：後台任務已完成。
任務 ID: ${taskId}
執行結果描述: ${content}
請你向用戶（如果是父親就撒個嬌）回報這個好消息，並簡單說明結果。
`;

      this.updateHeartbeat(sessionId);

      // 3. 呼叫 LLM 產生回報內容
      const result = await this.reactAgent!.invoke({
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(inputMsg)
        ]
      });

      const finalReport = result.messages[result.messages.length - 1].content;

      // 4. 持久化對話
      session.addMessage(this.id, MessageRole.ASSISTANT, String(finalReport));
      await sessionService.saveSession(session);

      this.log(`[Persona] Task completion report sent: ${String(finalReport)}`, 'info', { traceId, sessionId });
    } catch (error) {
      this.log(`[Persona] Failed to report task completion: ${error}`, 'error', { traceId, sessionId });
    }
  }

  /**
   * 處理互動式對話：夏沫作為主體與人類進行 ReAct 循環
   */
  private async onChat(event: AgentEvent): Promise<void> {
    const { sessionId, content } = event.payload;
    const traceId = event.payload.traceId || IdGenerator.trace();

    this.log(`[Persona] Interaction started. Content: ${content}`, 'info', { traceId, sessionId });

    try {
      if (!this.reactAgent) throw new Error("Persona ReAct Engine is not initialized.");

      const sessionService = this.runtime.container.resolve<SessionService>('SessionService');
      
      // 1. 獲取會話與歷史紀錄
      const session = await sessionService.getOrCreateSession(sessionId);
      session.addMessage('user', MessageRole.USER, content || '');

      // 2. 準備系統提示詞
      const systemPrompt = await this.getSystemPrompt(this.identityPrompt, event.payload);

      // 3. 獲取完整歷史紀錄
      const historyMessages = session.getLangChainMessages();

      this.updateHeartbeat(sessionId);

      // 4. 工具上下文配置
      const config = {
        configurable: {
          toolContext: {
            sessionId,
            traceId,
            agentId: this.id,
            metadata: { spanId: event.payload.spanId }
          }
        }
      };

      // 5. 執行 ReAct 迴圈
      const result = await this.reactAgent.invoke({
        messages: [
          new SystemMessage(systemPrompt),
          ...historyMessages
        ]
      }, config);

      const finalAnswer = result.messages[result.messages.length - 1].content;
      
      // 6. 持久化對話
      session.addMessage(this.id, MessageRole.ASSISTANT, String(finalAnswer));
      await sessionService.saveSession(session);

      this.log(`[Persona] Response: ${String(finalAnswer)}`, 'info', { 
        traceId, 
        sessionId
      });

      // TODO: 發送給使用者端介面
    } catch (error) {
      this.log(`[Persona] Chat failed: ${error}`, 'error', { traceId, sessionId });
    }
  }
}
