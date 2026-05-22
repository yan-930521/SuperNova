import { EventBus } from '../infra/EventBus';

/**
 * Session (會話層總帳)
 * 負責追蹤與使用者的對話歷史以及高層次的 Worker 執行摘要。
 */
export class Session {
  /** 對話歷史 */
  public history: { role: string; content: string; timestamp: number }[] = [];

  /**
   * 初始化 Session
   * @param id 會話 ID
   * @param goal 總體目標
   */
  constructor(public id: string, public goal: string) {
    // 訂閱 Worker 摘要事件，自動併入對話歷史
    EventBus.getInstance().subscribe('ACTION_SUMMARY', (event) => {
      if (event.session_id === this.id) {
        this.addMessage('worker', event.payload.summary);
      }
    });
  }

  /**
   * 新增訊息到對話歷史
   * @param role 角色 (user/worker/assistant 等)
   * @param content 訊息內容
   */
  addMessage(role: string, content: string) {
    this.history.push({
      role,
      content,
      timestamp: Date.now()
    });
  }
}
