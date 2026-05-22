import { EventBus } from '../infra/EventBus';

export class TaskEngineEvents {
  constructor(private sessionId: string) {}

  emit(type: string, payload: any) {
    EventBus.getInstance().publish({
      type,
      payload,
      timestamp: Date.now(),
      session_id: this.sessionId
    });
  }
}
