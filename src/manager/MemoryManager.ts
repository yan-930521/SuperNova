import { recorder } from '../infra/LogManager';
import { IMemoryRepository, MemoryDTO, MemoryLayer, MemoryType } from '../infra/types/memory';
import { MessageDTO, MessageRole } from '../infra/types/session';
import { AgentManager } from './AgentManager';

/**
 * 記憶管理器 (MemoryManager)
 * 負責處理記憶的生命週期、層級檢索與上下文壓縮 (Folding)。
 * 作為 Agent 認知上下文與底層儲存之間的橋樑。
 */
export class MemoryManager {
  /**
   * @param repo 記憶儲存庫實例
   * @param agentManager 代理管理器實例 (可選，用於獲取 Agent 上下文)
   */
  constructor(
    private repo: IMemoryRepository,
    private agentManager?: AgentManager
  ) {}

  /**
   * 獲取工作記憶 (Working Memory)
   * 返回特定 Chain 在當前會話中的變數與緩衝區 ID。
   * @param chainId 鏈識別碼
   * @param sessionId 會話識別碼
   */
  async getWorkingMemory(chainId: string, sessionId: string): Promise<MemoryDTO[]> {
    recorder.debug(`[MemoryManager] Getting working memory for chain: ${chainId}, session: ${sessionId}`, { type: 'SYSTEM' });
    
    // 從儲存庫中獲取 WORKING 層級的所有記憶
    // 注意：目前的 findByNamespace 可能需要過濾 chainId
    // 這裡我們假設 WORKING 記憶會存放在特定的命名空間，或者我們需要擴展 repo 接口
    // 根據 Unified Memory System 規範，WORKING 記憶關聯到特定 Chain
    
    // 暫時使用 findByNamespace('working', sessionId) 並在內存中過濾 chainId
    const allWorking = await this.repo.findByNamespace('working', sessionId);
    return allWorking.filter(m => m.layer === MemoryLayer.WORKING && m.chainId === chainId);
  }

  /**
   * 設置工作變數 (Working Variable)
   * 更新或創建 WORKING 層級的變數。
   * @param chainId 鏈識別碼
   * @param sessionId 會話識別碼
   * @param key 變數名稱 (作為 ID)
   * @param value 變數內容
   */
  async setWorkingVar(chainId: string, sessionId: string, key: string, value: string): Promise<void> {
    recorder.debug(`[MemoryManager] Setting working var: ${key} for chain: ${chainId}`, { type: 'SYSTEM' });
    
    const memory: MemoryDTO = {
      id: key,
      layer: MemoryLayer.WORKING,
      namespace: 'working',
      type: MemoryType.VARIABLE,
      content: value,
      tags: [key, 'working-var'],
      sessionId,
      chainId,
      timestamp: Date.now()
    };

    await this.repo.save(memory);
  }

  /**
   * 獲取一級索引 (L1 Index)
   * 彙整 PERSISTENT 與當前 WORKING 層級的所有可用標籤。
   * @param sessionId 會話識別碼
   * @param chainId 鏈識別碼 (可選)
   */
  async getL1Index(sessionId: string, chainId?: string): Promise<string> {
    recorder.debug(`[MemoryManager] Compiling L1 Index for session: ${sessionId}`, { type: 'SYSTEM' });
    
    // 1. 從儲存庫獲取基礎索引 (通常包含 IDs 和 Tags)
    const baseIndex = await this.repo.getL1Index(sessionId);
    const indexSet = new Set<string>(baseIndex);

    // 2. 如果提供了 chainId，額外過濾/獲取該 Chain 的 WORKING 標籤
    if (chainId) {
      const workingMem = await this.getWorkingMemory(chainId, sessionId);
      workingMem.forEach(m => {
        indexSet.add(m.id);
        m.tags.forEach(tag => indexSet.add(tag));
      });
    }

    // 3. 轉化為緊湊的字符串格式供 Prompt 使用
    return Array.from(indexSet).join(', ');
  }

  /**
   * 歷史記錄折疊 (History Folding)
   * 當對話訊息過多時，將舊訊息進行結構化折疊以節省 Token。
   * @param messages 原始訊息數組
   * @returns 折疊後的訊息數組
   */
  foldHistory(messages: MessageDTO[]): MessageDTO[] {
    if (messages.length <= 20) {
      return messages;
    }

    recorder.info(`[MemoryManager] Folding history: ${messages.length} messages -> folding oldest 15`, { type: 'SYSTEM' });

    // 取得最舊的 15 條訊息進行折疊
    const messagesToFold = messages.slice(0, 15);
    // 剩餘的訊息保持原樣
    const remainingMessages = messages.slice(15);
    
    const foldedMessages: MessageDTO[] = [];
    
    // 每 5 條訊息折疊成一個摘要點
    for (let i = 0; i < messagesToFold.length; i += 5) {
      const chunk = messagesToFold.slice(i, i + 5);
      const count = chunk.length;
      
      // 創建折疊後的 SYSTEM 訊息
      const foldedMsg: MessageDTO = {
        message: {
          content: `[System] (${count} turns folded): Previous conversation context is archived to save space.`,
          getType: () => 'system',
          additional_kwargs: {}
        } as any,
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
