import { Session } from '../../src/session/Session';
import { MainAgent } from '../../src/agent/MainAgent';
import { EngineManager } from '../../src/task/EngineManager';
import { EventBus } from '../../src/infra/EventBus';

describe('SuperNova 2.0 Full Cycle', () => {
  let manager: EngineManager;

  beforeEach(() => {
    // 每個測試前初始化 EngineManager 以確保其監聽器已註冊
    manager = new EngineManager();
  });

  it('should complete a user request through the entire decoupled pipeline', async () => {
    const sessionId = `session-e2e-${Date.now()}`;
    const session = new Session(sessionId, 'Test Goal');
    const mainAgent = new MainAgent('boss', session);

    // 1. 用戶發話
    await mainAgent.handleUserMessage("幫我研究 AI 趨勢");

    // 2. 等待任務引擎完成 (監聽 SESSION_COMPLETE)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Test timed out waiting for SESSION_COMPLETE'));
      }, 5000);

      EventBus.getInstance().subscribe('SESSION_COMPLETE', (event) => {
        if (event.session_id === sessionId) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // 3. 驗證 Session 是否正確同步了 Worker 的摘要
    const history = session.history;

    expect(history.some(h => h.role === 'user' && h.content === "幫我研究 AI 趨勢")).toBe(true);
    expect(history.some(h => h.role === 'worker' && h.content.includes('[Worker Summary]'))).toBe(true);
  }, 10000);
});
