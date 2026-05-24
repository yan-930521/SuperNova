import { EventBus } from '../../src/infra/EventBus';
import { Event } from '../../src/models/Event';

describe('EventBus', () => {
  it('should publish and subscribe to events', () => {
    const eventBus = new EventBus();
    const mockHandler = jest.fn();
    const eventType = 'test-event';
    const event: Event = {
      type: eventType,
      payload: { data: 'test' },
      timestamp: Date.now(),
    };

    eventBus.subscribe(eventType, mockHandler);
    eventBus.publish(event);

    expect(mockHandler).toHaveBeenCalledWith(event);
    eventBus.unsubscribe(eventType, mockHandler);
  });

  it('should support optional session_id and trace_id in Event', () => {
    const event: Event = {
      type: 'test',
      payload: {},
      timestamp: Date.now(),
      session_id: 'session-123',
      trace_id: 'trace-456',
    };
    expect(event.session_id).toBe('session-123');
    expect(event.trace_id).toBe('trace-456');
  });
});
