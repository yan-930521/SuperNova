import { describe, expect, it, mock } from "bun:test";
import { BaseAgent } from '../BaseAgent';
import { IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';

// Mock LogManager
const mockRecorder = {
  info: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
};

mock.module('../../infra/LogManager', () => ({
  recorder: mockRecorder
}));

class TestAgent extends BaseAgent {
  protected setupSubscriptions(): void {}
  public exposeLog(msg: string, level: any, context: any) {
    this.log(msg, level, context);
  }
}

describe('BaseAgent Logging with TraceID', () => {
  it('should include traceId and sessionId in log context', () => {
    const mockBus = {} as IEventBus<IAgentEventPayload>;
    const agent = new TestAgent('test-agent', mockBus);
    
    agent.exposeLog('test message', 'info', { 
      traceId: 'trace-123', 
      sessionId: 'session-456',
      metadata: { key: 'value' }
    } as any);

    expect(mockRecorder.info).toHaveBeenCalledWith(
      '[Agent:test-agent] test message',
      expect.objectContaining({
        trace_id: 'trace-123',
        session_id: 'session-456',
        key: 'value'
      })
    );
  });
});
