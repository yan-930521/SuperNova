import { IAgentEventPayload, IEventBus, IAgentExecuteContext } from '../core/messaging/IBus';
import { recorder } from '../infra/LogManager';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { MemoryService } from '../application/memory/MemoryService';
import { PulseEngine } from '../infra/PulseEngine';
import { ModelPreset } from '../infra/types/agent';
import { PromptLoader } from '../utils/PromptLoader';
import { InferenceEngine } from '../infra/ModelRegistry';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool as langChainTool } from '@langchain/core/tools';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { IdGenerator } from '../utils/IdGenerator';

/**
 * BaseAgent (代理基類) - SuperNova 0.4.0
 * 
 * 所有專業角色 Agent 的抽象基類。
 * 核心特性：
 * 1. 唯一注入 (Single Injection): 僅透過構造函數注入 Agent 專用 EventBus。
 * 2. 服務訪問 (Service Access): 透過 GlobalRuntime 單例存取其他系統級服務。
 * 3. 內置地基支持：提供快捷的黑板寫入、心跳同步與追蹤日誌。
 * 4. 引擎初始化支持：提供統一的推理引擎初始化機制。
 */
export abstract class BaseAgent {
   protected readonly runtime = GlobalRuntime.getInstance();
   /** LangChain 原生的 ReAct Agent 執行器 */
   protected reactAgent: ReturnType<typeof createReactAgent> | null = null;

   constructor(
     public readonly id: string,
     protected readonly bus: IEventBus<IAgentEventPayload>
   ) {
     this.setupSubscriptions();
     recorder.info(`[BaseAgent] Agent [${this.id}] initialized.`, { 
       type: 'SYSTEM',
       agent_id: this.id 
     });
   }

   /**
    * 子類必須實作，定義其監聽的事件
    */
   protected abstract setupSubscriptions(): void;

   /**
    * 統一的推理引擎初始化方法 (用於結構化輸出)
    * @param preset 模型預設類型 (SMART, FAST, EVAL 等)
    * @param promptPath 身份或任務專用的 Prompt Markdown 路徑
    */
   protected initEngine(preset: ModelPreset, promptPath: string): InferenceEngine {
     try {
       const baseEngine = this.runtime.modelRegistry.getModel(preset);
       const identityPrompt = PromptLoader.load(promptPath);
       const engine = baseEngine.withSystemPrompt(identityPrompt);
       this.log(`Engine initialized with [${preset}] using prompt: ${promptPath}`, 'debug');
       return engine;
     } catch (error) {
       this.log(`Engine initialization failed for ${promptPath}: ${error}`, 'error');
       throw error;
     }
   }

   /**
    * 初始化 LangChain 原生 ReAct Agent 執行器
    * 動態將系統的 BaseTool 封裝為 LangChain 認識的格式。
    */
   public buildExecutionEngine(modelPreset: ModelPreset): void {
     try {
       const model = this.runtime.modelRegistry.getRawModel(modelPreset);
       const allTools = this.runtime.toolRegistry.getAllTools();

       // 將 SuperNova BaseTool 包裝為 LangChain 原生工具
       const nativeTools = allTools.map(t => langChainTool(async (input, config) => {
         const context = config?.configurable?.toolContext || {
           sessionId: 'unknown',
           agentId: this.id,
           traceId: IdGenerator.trace()
         };

         // 確保 context 中包含 agentId
         const executeContext: IAgentExecuteContext = {
           ...context,
           agentId: context.agentId || this.id
         };

         return await (t as any).execute(input, executeContext);
       }, {
         name: t.name,
         description: t.description,
         schema: t.schema as any
       }));

       // 建立預編譯 ReAct Agent
       // 注意：我們不在這裡固定 messageModifier，而是在 invoke 時動態處理
       this.reactAgent = createReactAgent({
         llm: model,
         tools: nativeTools
       });
       
       recorder.info(`Agent [${this.id}] ReAct Engine built successfully.`, { type: 'SYSTEM' });
     } catch (error: any) {
       recorder.error(`Failed to build execution engine for Agent [${this.id}]: ${error.message}`);
     }
   }

  /**
   * 快捷方法：寫入數據至 L1 共享黑板
   * @param sessionId 會話 ID
   * @param key 語義 Key
   * @param data 具體數據
   * @param description 數據描述 (用於語義對齊)
   */
  protected async postToL1(sessionId: string, key: string, data: any, description: string = ''): Promise<void> {
    const memoryService = this.runtime.container.resolve<MemoryService>('MemoryService');
    await memoryService.postToL1(sessionId, this.id, key, data, description);
  }

  /**
   * 快捷方法：更新任務心跳，防止被 PulseEngine 判定為超時
   * @param taskId 任務 ID
   */
  protected updateHeartbeat(taskId: string): void {
    const pulseEngine = this.runtime.container.resolve<PulseEngine>('PulseEngine');
    pulseEngine.updateHeartbeat(taskId);
  }

  /**
   * 通用的狀態與日誌紀錄工具
   * 自動整合 Trace 資訊
   */
  protected log(msg: string, level: 'info' | 'error' | 'debug' | 'warn' = 'info', context?: Partial<IAgentEventPayload>): void {
    const formattedMsg = `[Agent:${this.id}] ${msg}`;
    
    // 自動從 context 中提取 trace 資訊，如果未提供則嘗試保持一致性
    const logContext = {
      type: 'AGENT',
      agent_id: this.id,
      trace_id: context?.traceId,
      session_id: context?.sessionId,
      span_id: context?.spanId,
      parent_span_id: context?.parentSpanId,
      ...context?.metadata
    };
    
    if (level === 'error') {
      recorder.error(formattedMsg, logContext);
    } else if (level === 'warn') {
      recorder.warn(formattedMsg, logContext);
    } else if (level === 'debug') {
      recorder.debug(formattedMsg, logContext);
    } else {
      recorder.info(formattedMsg, logContext);
    }
  }

  /**
   * 輔助方法：根據觸發事件，生成繼承的 Payload 基礎
   * 確保 traceId 貫通且 parentSpanId 正確指向
   * @param trigger 觸發當前動作的事件 Payload
   * @param rolePrefix 當前 Agent 的角色縮寫
   */
  protected inheritPayload(trigger: IAgentEventPayload, rolePrefix: 'sa' | 'pa' | 'da' | 'ca' | 'aa' | 'sys'): IAgentEventPayload {
    return {
      sessionId: trigger.sessionId,
      traceId: trigger.traceId,           // DNA 繼承：traceId 絕對不變
      parentSpanId: trigger.spanId,       // 鏈路貫通：我的父節點是你的 spanId
      spanId: IdGenerator.span(rolePrefix), // 留下足跡：生成我自己的 spanId
      taskId: trigger.taskId,
      goal: trigger.goal,                 // 業務繼承：保留目標
      content: trigger.content,           // 業務繼承：保留內容
      metadata: trigger.metadata
    };
  }
}
