import { BaseMemory } from './BaseMemory';
import { MemoryLayer, MemoryDTO, IBlackboardPointer } from '../../infra/types/memory';

/**
 * L1 記憶體實體 (Blackboard Pointer)
 */
export class L1Memory extends BaseMemory {
  constructor(
    id: string,
    sessionId: string,
    authorId: string,
    timestamp: number,
    public readonly data: IBlackboardPointer
  ) {
    super(id, sessionId, MemoryLayer.L1, authorId, timestamp);
  }

  public toDTO(): MemoryDTO<IBlackboardPointer> {
    return {
      id: this.id,
      sessionId: this.sessionId,
      layer: this.layer,
      authorId: this.authorId,
      timestamp: this.timestamp,
      data: this.data,
      metadata: this.metadata
    };
  }
}
