import { BaseSession } from './BaseSession';
import { SessionDTO } from '../../infra/types/session';

/**
 * 用戶會話實體 (UserSession)
 * 繼承自 BaseSession，代表一級總帳（與用戶的高階溝通）。
 */
export class UserSession extends BaseSession {
  /**
   * @param id 會話 ID
   * @param userId 隸屬的用戶 ID
   * @param responsibleAgentId 負責此會話的主代理 ID
   * @param status 當前會話狀態
   */
  constructor(
    id: string,
    public readonly userId: string,
    public readonly responsibleAgentId: string,
    status: string = 'IDLE'
  ) {
    super(id, status);
  }

  /**
   * 轉換為 DTO 用於持久化
   */
  public toDTO(): SessionDTO {
    return {
      id: this.id,
      userId: this.userId,
      responsibleAgentId: this.responsibleAgentId,
      status: this.status,
      history: this.history,
      metadata: this.metadata as Record<string, any> // DTO 暫時保持 any 以相容現有介面
    };
  }
}
