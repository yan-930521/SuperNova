import { PulseEngine, IPulseHook, PulseHookType, PulseActionType } from '../../src/infra/PulseEngine';
import { IEventBus, SystemEventType } from '../../src/infra/types/events';

describe('PulseEngine', () => {
  let eventBus: jest.Mocked<IEventBus>;
  let pulseEngine: PulseEngine;

  beforeEach(() => {
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn()
    } as any;
    pulseEngine = new PulseEngine(eventBus);
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (pulseEngine && typeof pulseEngine.stop === 'function') {
      pulseEngine.stop();
    }
    jest.useRealTimers();
  });

  test('should publish SYSTEM_TICK event every tick', () => {
    pulseEngine.start(1000);
    
    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: SystemEventType.SYSTEM_TICK,
      payload: expect.objectContaining({ tickCount: 1 })
    }));

    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: SystemEventType.SYSTEM_TICK,
      payload: expect.objectContaining({ tickCount: 2 })
    }));
  });

  test('should execute registered hooks at correct intervals', () => {
    const hook: IPulseHook = {
      id: 'test-hook',
      type: PulseHookType.INTERVAL,
      config: { interval: 2 },
      action: {
        type: PulseActionType.EMIT_EVENT,
        payload: { type: 'TEST_EVENT' }
      }
    };

    pulseEngine.registerHook(hook);
    pulseEngine.start(1000);

    // Clear publish calls from SYSTEM_TICK
    eventBus.publish.mockClear();

    // Tick 1
    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TEST_EVENT' }));

    // Tick 2
    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'TEST_EVENT' }));
    
    eventBus.publish.mockClear();

    // Tick 3
    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TEST_EVENT' }));

    // Tick 4
    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'TEST_EVENT' }));
  });
});
