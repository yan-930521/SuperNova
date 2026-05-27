import { PulseEngine, PulseHookType, PulseActionType, IPulseHook } from '../../src/infra/PulseEngine';
import { IEventBus, SystemEventType, ISystemEvent } from '../../src/infra/types/events';

describe('PulseEngine Plugin & Custom Event Support', () => {
  let pulseEngine: PulseEngine;
  let mockEventBus: jest.Mocked<IEventBus>;

  beforeEach(() => {
    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };
    pulseEngine = new PulseEngine(mockEventBus);
    jest.useFakeTimers();
  });

  afterEach(() => {
    pulseEngine.stop();
    jest.useRealTimers();
  });

  test('Test Case 1: Plugin updates state pool and triggers THRESHOLD hook', () => {
    const hook: IPulseHook = {
      id: 'threshold-hook-01',
      type: PulseHookType.THRESHOLD,
      config: {
        path: 'plugin.metrics.memoryUsage',
        operator: '>',
        threshold: 80,
      },
      action: {
        type: PulseActionType.EMIT_EVENT,
        payload: { type: 'MEMORY_ALERT', value: 85 }
      }
    };

    pulseEngine.registerHook(hook);
    pulseEngine.start(1000);

    // 模擬 Plugin 更新狀態
    pulseEngine.setState('plugin.metrics.memoryUsage', 85);

    // 前進一秒觸發 Tick
    jest.advanceTimersByTime(1000);

    // 驗證是否發出警報事件
    expect(mockEventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'MEMORY_ALERT',
      value: 85
    }));
  });

  test('Test Case 2: Plugin emits custom event and triggers EVENT hook', () => {
    let subscribeHandler: (event: any) => void = () => {};
    mockEventBus.subscribe.mockImplementation((type, handler) => {
      if (type === 'CUSTOM_PLUGIN_EVENT' as any) {
        subscribeHandler = handler;
      }
    });

    const hook: IPulseHook = {
      id: 'event-hook-01',
      type: PulseHookType.EVENT,
      config: {
        eventName: 'CUSTOM_PLUGIN_EVENT',
      },
      action: {
        type: PulseActionType.LOG,
        payload: { message: 'Custom event received' }
      }
    };

    pulseEngine.registerHook(hook);
    
    // 模擬 Plugin 發出事件
    const customEvent = {
      type: 'CUSTOM_PLUGIN_EVENT' as any,
      payload: { data: 'some-data' },
      timestamp: Date.now()
    };
    
    subscribeHandler(customEvent);

    // 驗證 EventBus.subscribe 被呼叫
    expect(mockEventBus.subscribe).toHaveBeenCalledWith('CUSTOM_PLUGIN_EVENT', expect.any(Function));
  });

  test('Test Case 3: unwatchTask stops timeout monitoring', () => {
    const taskId = 'task-001';
    pulseEngine.watchTask(taskId, 5000);
    pulseEngine.start(1000);

    // 前進 4 秒，不應觸發超時
    jest.advanceTimersByTime(4000);
    expect(mockEventBus.publish).not.toHaveBeenCalledWith(expect.objectContaining({
      type: SystemEventType.TASK_FAILED,
      payload: expect.objectContaining({ taskId })
    }));

    // 停止監控
    pulseEngine.unwatchTask(taskId);

    // 前進 2 秒 (總共 6 秒)，如果不停止監控則會超時
    jest.advanceTimersByTime(2000);
    
    // 驗證 TASK_FAILED 沒有因為 task-001 被發布
    const taskFailedCalls = mockEventBus.publish.mock.calls.filter(call => 
      call[0].type === SystemEventType.TASK_FAILED && call[0].payload.taskId === taskId
    );
    expect(taskFailedCalls.length).toBe(0);
  });
});
