import { ContextService } from '../../application/context/ContextService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { ReActResponseSchema } from '../../schemas/agent/AgentOutputSchemas';
import { BaseAgent } from '../BaseAgent';
import { MemoryService } from '../../application/memory/MemoryService';
import { PromptLoader } from '../../utils/PromptLoader';
import { IdGenerator } from '../../utils/IdGenerator';
import { InferenceEngine } from '../../infra/ModelRegistry';

/**
 * DoingAgent (行動者) - SuperNova 0.4.0
 * 職責: 執行具體任務節點，遵循 Thought -> Action -> Observation 的 ReAct 模式。
 * 特點: 內置地基支持，實時同步進度至共享黑板，並具備範圍溢出 (Scope Creep) 自我意識。
 */
export class DoingAgent extends BaseAgent {
  /** ReAct 推理引擎 */
  private reactEngine: InferenceEngine;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.reactEngine = this.initEngine(ModelPreset.FAST, 'prompts/identity/doing_agent.md');
  }

  protected setupSubscriptions(): void {
    // 監聽任務執行啟動事件
    this.bus.subscribe(AgentEvents.Doing.Start, this.onDoingStart.bind(this));
  }

  /**
   * 處理執行啟動：開啟 ReAct 思考循環
   */
  private async onDoingStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId, goal } = event.payload;
    this.log(`Task execution started for node: ${taskId}`, 'info', { traceId, sessionId });

    try {
      // 1. 獲取必要服務與工具註冊表
      const contextService = this.runtime.container.resolve<ContextService>('ContextService');
      const memoryService = this.runtime.container.resolve<MemoryService>('MemoryService');
      const toolRegistry = this.runtime.toolRegistry;

      // 2. 初始化會話上下文：獲取當前黑板已有的 Keys 指針
      const blackboardKeys = await memoryService.getL1Index(sessionId);

      let isFinished = false;
      let iteration = 0;
      const MAX_ITERATIONS = 12; // 門禁：單一任務最大步數
      const history: any[] = [];

      // 核心 ReAct 循環
      while (!isFinished && iteration < MAX_ITERATIONS) {
        iteration++;
        
        // 3. 自動更新脈搏心跳，防止 PulseEngine 觸發超時換檔
        this.updateHeartbeat(taskId!);

        // 4. 渲染動態上下文 Prompt (整合 L1/L2/L3 投影)
        const systemPrompt = contextService.renderPrompt('DoingAgent', event.payload, blackboardKeys);

        // 5. 調用預熱引擎進行單步推理
        const response = await this.reactEngine.withSystemPrompt(systemPrompt).infer({
          goal: goal || 'Execute assigned task',
          currentTask: `Executing node ${taskId}`,
          messages: history,
          metadata: { traceId, sessionId, taskId }
        }, ReActResponseSchema);

        this.log(`Iteration ${iteration} Thought: ${response.thought.substring(0, 100)}...`, 'debug', { traceId, sessionId });

        // 6. 範圍溢出 (Scope Creep) 監控：若思考過於發散或步數過多，主動請求 SA 介入
        if (iteration >= 10 || response.thought.length > 2500) {
          this.log(`Scope Creep detected. Escalating to Supervisor...`, 'warn', { traceId, sessionId });
          this.bus.publish({
            type: AgentEvents.Flow.Escalate,
            timestamp: Date.now(),
            payload: {
              sessionId, traceId, taskId,
              spanId: IdGenerator.span('da'),
              reason: "SCOPE_CREEP: Task complexity exceeds current execution limits. Potential architectural change required.",
              metadata: { iteration, lastThought: response.thought }
            }
          });
          return; // 中止本地循環，移交指揮權
        }

        // 7. 執行工具呼叫邏輯
        if (response.action) {
          const { toolName, args } = response.action;
          this.log(`Action: ${toolName}`, 'info', { traceId, sessionId });

          try {
            const tool = toolRegistry.getTool(toolName);
            if (!tool) throw new Error(`Tool ${toolName} not found in registry.`);

            // 執行實體行動
            const observation = await tool.execute(args, { 
              sessionId, 
              traceId, 
              agentId: this.id,
              metadata: { taskId, iteration }
            } as any);
            
            // 8. 實時同步進度：將重要觀察結果寫入 L1 共享黑板 (地基功能)
            // 理由：確保 CheckingAgent 能在執行過程中隨時同步最新數據。
            await this.postToL1(
              sessionId, 
              `observation_${taskId}_step_${iteration}`, 
              observation, 
              `Observation from ${toolName} during task ${taskId}`
            );
            
            // 記錄至 LLM 對話歷史
            history.push({ role: 'assistant', content: `Thought: ${response.thought}\nAction: ${toolName}(${JSON.stringify(args)})` });
            history.push({ role: 'system', content: `Observation: ${JSON.stringify(observation)}` });

          } catch (toolError: any) {
            this.log(`Tool Error: ${toolError.message}`, 'error', { traceId, sessionId });
            history.push({ role: 'system', content: `Error: Tool ${toolName} failed: ${toolError.message}` });
          }
        } 
        // 9. 任務結案邏輯
        else if (response.answer) {
          this.log(`Node ${taskId} completed with answer.`, 'info', { traceId, sessionId });
          
          // 最終產出存入黑板，供後續階段 (Checking) 使用
          await this.postToL1(
            sessionId, 
            `final_result_${taskId}`, 
            response.answer, 
            `Final answer for task node ${taskId}`
          );

          this.bus.publish({
            type: AgentEvents.Doing.Finish,
            timestamp: Date.now(),
            payload: { 
              sessionId, 
              traceId, 
              taskId, 
              content: response.answer,
              spanId: IdGenerator.span('da')
            }
          });
          isFinished = true;
        }
      }

      // 10. 安全退出：若超出步數限制
      if (!isFinished) {
        throw new Error(`Task ${taskId} reached MAX_ITERATIONS without definitive answer.`);
      }

    } catch (error) {
      this.log(`Critical execution error: ${error}`, 'error', { traceId, sessionId });
      
      // 回報失敗，觸發自癒流程
      this.bus.publish({
        type: AgentEvents.Doing.Fail,
        timestamp: Date.now(),
        payload: { 
          sessionId, 
          traceId, 
          taskId, 
          error: String(error),
          spanId: IdGenerator.span('da')
        }
      });
    }
  }
}
