import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { IEventBus } from '../../interfaces/infra/IEventBus';
import { ISessionManager } from '../../interfaces/infra/ISessionManager';
import { ISession } from '../../interfaces/session/ISession';

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
    runtime = new GlobalRuntime(mockSessionManager as ISessionManager, mockEventBus, 100);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should trigger session ticks on interval', async () => {
    const mockSession: Partial<ISession> = { tick: jest.fn() };
    mockSessionManager.getActiveSessions.mockReturnValue({ 's1': mockSession });

    await runtime.start();
    jest.advanceTimersByTime(150); // 觸發第一個 Tick

    expect(mockSession.tick).toHaveBeenCalled();
  });

  test('should stop when stop is called', async () => {
    const mockSession: Partial<ISession> = { tick: jest.fn() };
    mockSessionManager.getActiveSessions.mockReturnValue({ 's1': mockSession });

    await runtime.start();
    await runtime.stop();
    jest.advanceTimersByTime(200);

    expect(mockSession.tick).not.toHaveBeenCalled();
  });
});
