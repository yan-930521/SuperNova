import {
    AIMessage, BaseMessage, HumanMessage, mapStoredMessageToChatMessage, StoredMessage,
    SystemMessage, ToolMessage
} from '@langchain/core/messages';

import { IEntity } from '../../infra/persistence/IRepository';
import { MessageDTO, MessageRole } from '../../infra/types/session';
import { IdGenerator } from '../../utils/IdGenerator';

/**
 * 基礎會話實體 (BaseSession)
 * 作為所有「訊息鏈」的基底類別，封裝了通用的訊息處理與狀態維護邏輯。
 * 遵循領域純粹性：不依賴任何外部 IO 或全域 Runtime。
 */
export abstract class BaseSession implements IEntity {
  /** 
   * 對話歷史：系統的「會話總帳」
   */
  public history: MessageDTO[] = [];

  /** 
   * 額外元數據存儲，禁用 any，使用 unknown 配合型別檢查
   */
  public metadata: Record<string, unknown> = {};

  /**
   * @param id 唯一識別碼
   * @param status 當前狀態 (例如: IDLE, RUNNING, PENDING)
   */
  constructor(
    public readonly id: string,
    public status: string
  ) { }

  /**
   * 獲取純 LangChain 訊息序列
   * 用於傳遞給推理引擎 (LLM)。
   */
  public getLangChainMessages(): BaseMessage[] {
    return this.history.map(item => item.message);
  }

  /**
   * 純邏輯：封裝訊息並推入歷史紀錄
   * @param authorId 發送者 ID (User ID 或 Agent ID)
   * @param role 角色 (Enum)
   * @param content 訊息內容
   * @param metadata 額外元數據
   * @returns 封裝後的 MessageDTO
   */
  public addMessage(
    authorId: string,
    role: MessageRole,
    content: string,
    metadata: Record<string, unknown> = {}
  ): MessageDTO {
    let message: BaseMessage;

    switch (role) {
      case MessageRole.USER:
        message = new HumanMessage({ content });
        break;
      case MessageRole.ASSISTANT:
        message = new AIMessage({ content });
        break;
      case MessageRole.SYSTEM:
        message = new SystemMessage({ content });
        break;
      case MessageRole.TOOL:
        message = new ToolMessage({
          content,
          tool_call_id: (metadata.tool_call_id as string) || IdGenerator.pointer()
        });
        break;
      case MessageRole.WORKER:
        // 將 Worker 的觀察摘要視為一種帶有特定標籤的 AIMessage
        message = new AIMessage({
          content: `[Worker Observation] ${content}`,
          additional_kwargs: { is_worker_summary: true, ...metadata }
        });
        break;
      default:
        message = new SystemMessage({ content: `[${role}] ${content}` });
    }

    const dto: MessageDTO = {
      message,
      identity: {
        role,
        authorId,
        name: (metadata.authorName as string) || authorId,
        ...metadata
      }
    };

    this.history.push(dto);
    return dto;
  }

  /**
   * 批次更新歷史紀錄 (用於從持久層載入)
   */
  public setHistory(history: MessageDTO[]): void {
    this.history = history.map(mdto => {
      return {
        message: mapStoredMessageToChatMessage(mdto.message as unknown as StoredMessage),
        identity: mdto.identity
      }
    })
  }
}
