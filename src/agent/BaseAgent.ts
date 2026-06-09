import { IAgentEventPayload, IEventBus } from '../core/messaging/IBus';
import { recorder } from '../infra/LogManager';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { MemoryService } from '../application/memory/MemoryService';
import { PulseEngine } from '../infra/PulseEngine';
import { ModelPreset } from '../infra/types/agent';
import { PromptLoader } from '../utils/PromptLoader';
import { InferenceEngine } from '../infra/ModelRegistry';

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
    * 統一的引擎初始化方法
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
}
