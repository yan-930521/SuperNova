import { Session } from '../session/Session';
import { TaskDispatcherTool } from './tools/TaskDispatcherTool';

/**
 * MainAgent (主代理)
 * 負責接收使用者訊息、維護會話歷史，並調度任務圖。
 */
export class MainAgent {
  constructor(public id: string, private session: Session) {}

  /**
   * 處理使用者訊息
   * @param message 使用者輸入
   * @returns 回覆訊息
   */
  async handleUserMessage(message: string): Promise<string> {
    // 1. 記錄使用者訊息到 Session
    this.session.addMessage('user', message);

    // 2. 模擬決策過程 (Deep Thinking)
    // 在 2.0 完整版中，這裡會調用 LLM 生成 TaskGraph
    const mockNodes = [
      { 
        id: 't1', 
        type: 'worker',
        goal: `Process: ${message}`, 
        dependencies: [],
        status: 'pending'
      }
    ];

    // 3. 透過工具發布任務執行請求
    await TaskDispatcherTool.dispatch(this.session.id, mockNodes);

    return "已收到需求，正在後台處理中。";
  }
}
