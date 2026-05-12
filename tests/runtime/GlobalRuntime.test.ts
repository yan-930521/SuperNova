import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import type { IEventBus } from '../../interfaces/infra/IEventBus';
import type { ISessionManager } from '../../interfaces/infra/ISessionManager';
import type { ISession } from '../../interfaces/session/ISession';

describe('GlobalRuntime', () => {
  let runtime: GlobalRuntime;
  let mockSessionManager: any;
  let mockEventBus: jest.Mocked<IEventBus>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockSessionManager = {
      createFromJSON: jest.fn(),
      restoreFromSnapshot: jest.fn(),
      getActiveSessions: jest.fn().mockReturnValue({})
    };
    mockEventBus = { publish: jest.fn(), subscribe: jest.fn() } as any;
    runtime = new GlobalRuntime(mockSessionManager as ISessionManager, mockEventBus);
    
    // 手動注入 Mock Config，避免 start() 觸發檔案系統操作
    runtime.config = {
      runtime: {
        tick_rate_ms: 100,
        max_active_sessions: 10
      }
    } as any;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should trigger session ticks on interval', async () => {
    const mockSession: Partial<ISession> = { tick: jest.fn() };
    mockSessionManager.getActiveSessions.mockReturnValue({ 's1': mockSession });

    await runtime.start();
    await jest.advanceTimersByTimeAsync(150); // 觸發第一個 Tick

    expect(mockSession.tick).toHaveBeenCalled();
  });

  test('should stop when stop is called', async () => {
    const mockSession: Partial<ISession> = { tick: jest.fn() };
    mockSessionManager.getActiveSessions.mockReturnValue({ 's1': mockSession });

    await runtime.start();
    await runtime.stop();
    await jest.advanceTimersByTimeAsync(200);

    expect(mockSession.tick).not.toHaveBeenCalled();
  });
});
