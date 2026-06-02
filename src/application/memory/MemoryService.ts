import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { IMemoryRepository } from '../../infra/persistence/IRepository';
import { MemoryDTO } from '../../infra/types/memory';
import { MessageDTO, MessageRole } from '../../infra/types/session';
import { recorder } from '../../infra/LogManager';
import { SystemMessage } from '@langchain/core/messages';

/**
 * MemoryService (記憶服務)
 * 負責處理記憶的生命週期、層級檢索與上下文壓縮 (Folding)。
 * 0.3.0 版起，短期的「工作記憶」與「L1 Index」已由 OrchestratedContextService 接管。
 * 本服務專注於持久化長期記憶與會話歷史摺疊。
 */
export class MemoryService implements ILifecycle {
  constructor(
    private readonly memoryRepo: IMemoryRepository<MemoryDTO>
  ) {}

  /**
   * 生命週期：初始化
   */
  async initialize(): Promise<void> {
    recorder.info('[MemoryService] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[MemoryService] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    recorder.info('[MemoryService] Stopped', { type: 'SYSTEM' });
  }

  /**
   * 歷史記錄折疊 (History Folding) - 核心認知資產
   */
  public foldHistory(messages: MessageDTO[]): MessageDTO[] {
    if (messages.length <= 20) {
      return messages;
    }

    recorder.info(`[MemoryService] Folding history: ${messages.length} messages -> archiving oldest items`, { type: 'SYSTEM' });

    // 目前採用簡易摺疊邏輯 (保留最新 5 條，其餘摺疊)
    const foldThreshold = 15;
    const messagesToFold = messages.slice(0, foldThreshold);
    const remainingMessages = messages.slice(foldThreshold);

    const foldedMessages: MessageDTO[] = [];

    // 每 5 條摺疊成一個摘要標籤
    for (let i = 0; i < messagesToFold.length; i += 5) {
      const chunk = messagesToFold.slice(i, i + 5);
      const foldedMsg: MessageDTO = {
        message: new SystemMessage(`[System] (${chunk.length} turns folded): Context archived to save space.`),
        identity: {
          authorId: 'system',
          role: MessageRole.SYSTEM,
          name: 'ContextFolder'
        }
      };
      foldedMessages.push(foldedMsg);
    }

    return [...foldedMessages, ...remainingMessages];
  }
}
