import { describe, expect, it, mock } from "bun:test";
import { SupervisorAgent } from '../SupervisorAgent';
import { AgentEvents, IAgentEventPayload, IEventBus } from '../../../core/messaging/IBus';

// Mock LogManager
const mockRecorder = {
  info: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
};

mock.module('../../../infra/LogManager', () => ({
  recorder: mockRecorder
}));

describe('SupervisorAgent TraceID Propagation', () => {
  it('should generate a traceId if not present in Dispatch event', () => {
    let dispatchHandler: any;
    const mockBus = {
      subscribe: mock((type, handler) => {
        if (type === AgentEvents.Supervisor.Dispatch) {
          dispatchHandler = handler;
        }
      }),
      publish: mock(() => {}),
    } as unknown as IEventBus<IAgentEventPayload>;
    
    const agent = new SupervisorAgent('supervisor', mockBus);
    
    expect(dispatchHandler).toBeDefined();
    
    // Simulate Dispatch event
    dispatchHandler({
      type: AgentEvents.Supervisor.Dispatch,
      timestamp: Date.now(),
      payload: { 
        sessionId: 'session-1',
        goal: 'test goal'
      }
    });

    expect(mockRecorder.info).toHaveBeenCalledWith(
      expect.stringContaining('[Supervisor] dispatched goal: test goal'),
      expect.objectContaining({
        trace_id: expect.any(String),
        session_id: 'session-1'
      })
    );
  });
});
