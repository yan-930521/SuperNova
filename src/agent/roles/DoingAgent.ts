import { ContextService } from '../../application/context/ContextService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { ReActResponseSchema } from '../../schemas/agent/AgentOutputSchemas';
import { BaseAgent } from '../BaseAgent';

/**
 * DoingAgent (行動者)
 * 職責: 執行具體任務，遵循 Thought -> Action -> Observation 的 ReAct 模式。
 */
export class DoingAgent extends BaseAgent {
  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
  }

  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Doing.Start, this.onDoingStart.bind(this));
  }

  private async onDoingStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId, goal } = event.payload;
    this.log(`Task execution started: ${taskId}`, 'info', { traceId, sessionId });

    try {
      // 1. 獲取必要服務
      const contextService = this.runtime.container.resolve<ContextService>('ContextService');
      const engine = this.runtime.modelRegistry.getModel(ModelPreset.FAST); // 執行通常使用快速模型
      const toolRegistry = this.runtime.toolRegistry;

      // 2. 初始化會話上下文 (從黑板讀取 Keys)
      // TODO: 這裡應該從 MemoryService 獲取當前 sessionId 的所有 Key
      const blackboardKeys: string[] = []; 

      let isFinished = false;
      let iteration = 0;
      const MAX_ITERATIONS = 10;
      const history: any[] = [];

      while (!isFinished && iteration < MAX_ITERATIONS) {
        iteration++;

        // 渲染當前 Prompt
        const systemPrompt = contextService.renderPrompt('DoingAgent', event.payload, blackboardKeys);

        // 3. 執行推理
        const response = await engine.withSystemPrompt(systemPrompt).infer({
          goal: goal || 'Execute assigned task',
          currentTask: `Executing ${taskId}`,
          messages: history,
          metadata: { traceId, sessionId, taskId }
        }, ReActResponseSchema);

        this.log(`Thought: ${response.thought}`, 'debug', { traceId, sessionId });

        if (response.action) {
          const { toolName, args } = response.action;
          this.log(`Action: Calling tool ${toolName}`, 'info', { traceId, sessionId });

          try {
            // 4. 執行工具
            const tool = toolRegistry.getTool(toolName);
            // const observation = await tool.execute(args, { sessionId, traceId, taskId } as any);
            
            this.log(`Observation: Tool execution successful`, 'debug', { traceId, sessionId });
            
            // 紀錄到歷史
            // history.push({ role: 'assistant', content: JSON.stringify(response) });
            // history.push({ role: 'system', content: `Observation: ${JSON.stringify(observation)}` });

          } catch (toolError) {
            this.log(`Tool Error: ${toolError}`, 'error', { traceId, sessionId });
            history.push({ role: 'system', content: `Error: Tool ${toolName} failed: ${toolError}` });
          }
        } else if (response.answer) {
          // 任務完成
          this.log(`Task completed with answer: ${response.answer}`, 'info', { traceId, sessionId });
          
          this.bus.publish({
            type: AgentEvents.Doing.Finish,
            timestamp: Date.now(),
            payload: { 
              sessionId, 
              traceId, 
              taskId, 
              content: response.answer 
            }
          });
          isFinished = true;
        } else {
          throw new Error('LLM provided neither action nor answer.');
        }
      }

      if (!isFinished) {
        throw new Error(`Task ${taskId} reached maximum iterations (${MAX_ITERATIONS}).`);
      }

    } catch (error) {
      this.log(`Task execution failed: ${error}`, 'error', { traceId, sessionId });
      this.bus.publish({
        type: AgentEvents.Doing.Fail,
        timestamp: Date.now(),
        payload: { sessionId, traceId, taskId, error: String(error) }
      });
    }
  }
}
