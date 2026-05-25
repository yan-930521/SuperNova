import { EventBus } from '../../src/infra/EventBus';
import { SystemEventType, ISystemEvent } from '../../src/infra/types/events';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should notify subscribers when an event is published', () => {
    const mockHandler = jest.fn();
    const eventType = SystemEventType.TASK_STARTED;
    const event: ISystemEvent = {
      type: eventType,
      userId: 'user-1',
      sessionId: 'sess-1',
      payload: { taskId: 't1' },
      timestamp: Date.now()
    };

    eventBus.subscribe(eventType, mockHandler);
    eventBus.publish(event);

    expect(mockHandler).toHaveBeenCalledWith(event);

    eventBus.unsubscribe(eventType, mockHandler);
  });

  it('should not notify unsubscribed handlers', () => {
    const mockHandler = jest.fn();
    const eventType = SystemEventType.TASK_COMPLETED;
    const event: ISystemEvent = {
      type: eventType,
      userId: 'user-1',
      sessionId: 'sess-1',
      payload: { taskId: 't1' },
      timestamp: Date.now()
    };

    eventBus.subscribe(eventType, mockHandler);
    eventBus.unsubscribe(eventType, mockHandler);
    eventBus.publish(event);

    expect(mockHandler).not.toHaveBeenCalled();
  });
});
