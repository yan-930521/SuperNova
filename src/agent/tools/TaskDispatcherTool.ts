import { EventBus } from '../../infra/EventBus';

export class TaskDispatcherTool {
  /**
   * 發布 SESSION_START 事件，觸發 TaskEngine 開始執行任務
   * @param sessionId 會話 ID
   * @param nodes 任務節點列表
   */
  static async dispatch(sessionId: string, nodes: any[]) {
    EventBus.getInstance().publish({
      type: 'SESSION_START',
      payload: { nodes },
      timestamp: Date.now(),
      session_id: sessionId
    });
  }
}
