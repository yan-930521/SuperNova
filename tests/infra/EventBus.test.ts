import { EventBus } from '../../src/infra/EventBus';
import type { IEvent } from '../../interfaces/models/IEvent';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  test('should notify subscribers when event is published', () => {
    const handler = jest.fn();
    const event: IEvent = {
      type: 'TEST_EVENT',
      payload: { data: 123 },
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    };

    eventBus.subscribe('TEST_EVENT', handler);
    eventBus.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  test('should not notify subscribers of different event types', () => {
    const handler = jest.fn();
    const event: IEvent = {
      type: 'OTHER_EVENT',
      payload: {},
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    };

    eventBus.subscribe('TEST_EVENT', handler);
    eventBus.publish(event);

    expect(handler).not.toHaveBeenCalled();
  });

  test('should handle multiple subscribers', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    const event: IEvent = {
      type: 'MULTI',
      payload: {},
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    };

    eventBus.subscribe('MULTI', h1);
    eventBus.subscribe('MULTI', h2);
    eventBus.publish(event);

    expect(h1).toHaveBeenCalledWith(event);
    expect(h2).toHaveBeenCalledWith(event);
  });

  test('should be able to unsubscribe', () => {
    const handler = jest.fn();
    eventBus.subscribe('SUB', handler);
    eventBus.unsubscribe('SUB', handler);
    
    eventBus.publish({
      type: 'SUB',
      payload: {},
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
