import { BaseAgent } from '../../core/agent/BaseAgent';
import { infra } from '../../core';
import { SubAgent } from './SubAgent';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DataBlock } from '../../core/messaging/DataBlock';
import * as path from 'path';

/**
 * MainAgent (永久型 / 無形體)
 * 系統的中樞大腦 (Brain in a Vat) 與全局管理者。
 * 負責全局任務分派、長期記憶與上下文快照管理、以及 SubAgent 的生命週期管理 (God Mode)。
 */
export class MainAgent extends BaseAgent {
  private readonly subAgents: Map<string, BaseAgent> = new Map();

  protected getModel(): BaseChatModel {
    return {} as any; // 測試與初期 Stub，不實際調用 LLM
  }

  /**
   * 上帝視角：動態建立一個 SubAgent (子代理人)
   * @param agentId 子代理人唯一 ID
   * @param options 選擇是否為分身模式、工作區路徑、或是特化注入的 Repository
   */
  public async createSubAgent(
    agentId: string,
    options?: {
      isClone?: boolean;
      workspacePath?: string;
      stateRepo?: infra.persistence.IAgentStateRepository;
    }
  ): Promise<BaseAgent> {
    const isClone = options?.isClone || false;
    let subAgent: SubAgent;

    if (isClone) {
      // 分身模式：共享記憶 (oplogDir 與 workspacePath 與 MainAgent 共享)
      subAgent = new SubAgent(agentId, this.sessionId, this.eventBus, this.config, {
        parentAgent: this,
        isClone: true,
        workspacePath: this.workspacePath,
        stateRepo: options?.stateRepo || this.stateRepo
      });
      this.logger.info(`Successfully spawned clone SubAgent: ${agentId} sharing memory with MainAgent: ${this.id}`);
    } else {
      // 獨立模式：建立獨立的工作空間與隔離目錄
      const subWorkspace = options?.workspacePath || path.join(this.workspacePath, 'subagents', agentId);
      subAgent = new SubAgent(agentId, this.sessionId, this.eventBus, this.config, {
        workspacePath: subWorkspace,
        stateRepo: options?.stateRepo || this.stateRepo
      });
      this.logger.info(`Successfully spawned independent SubAgent: ${agentId} with isolated directory`);
    }

    this.subAgents.set(agentId, subAgent);
    return subAgent;
  }

  /**
   * 上帝視角：獲取特定子代理人實例
   */
  public getSubAgent(agentId: string): BaseAgent | undefined {
    return this.subAgents.get(agentId);
  }

  /**
   * 上帝視角：銷毀特定子代理人並釋放其監聽與資源
   */
  public async destroySubAgent(agentId: string): Promise<void> {
    const subAgent = this.subAgents.get(agentId);
    if (subAgent) {
      await subAgent.destroy();
      this.subAgents.delete(agentId);
      this.logger.info(`Successfully destroyed SubAgent: ${agentId} and released resources`);
    } else {
      this.logger.warn(`Attempted to destroy non-existent SubAgent: ${agentId}`);
    }
  }

  /**
   * 覆寫大腦主入口 processInbox
   * 接收來自 EventBus 喚醒投遞的事件 DataBlock
   */
  protected async processInbox(messages: DataBlock[]): Promise<void> {
    this.logger.info(`MainAgent ${this.id} received ${messages.length} message(s) to process.`);
    for (const msg of messages) {
      this.logger.info(`MainAgent ${this.id} processing message: [ID: ${msg.id}] [Type: ${msg.type}] [Intent: ${msg.intent}]`);
      // 核心大腦分析與流轉邏輯（未來擴展）
    }
  }
}
