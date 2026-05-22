import { MainAgent } from '../../src/agent/MainAgent';
import { Session } from '../../src/session/Session';
import { EventBus } from '../../src/infra/EventBus';

describe('MainAgent', () => {
  let eventBus: EventBus;
  let session: Session;
  let mainAgent: MainAgent;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    session = new Session('session-1', 'Test Goal');
    mainAgent = new MainAgent('main-1', session);
  });

  it('should add message to history and dispatch SESSION_START event', async () => {
    const publishSpy = jest.spyOn(eventBus, 'publish');
    const message = 'Hello SuperNova';

    const response = await mainAgent.handleUserMessage(message);

    // 驗證回覆
    expect(response).toBe("已收到需求，正在後台處理中。");

    // 驗證會話歷史
    expect(session.history.some(h => h.role === 'user' && h.content === message)).toBe(true);

    // 驗證事件發布
    expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SESSION_START',
      session_id: 'session-1',
      payload: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 't1' })
        ])
      })
    }));

    publishSpy.mockRestore();
  });
});
