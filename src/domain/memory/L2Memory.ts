import { BaseMemory } from './BaseMemory';
import { MemoryLayer, MemoryDTO, IFactData } from '../../infra/types/memory';

/**
 * L2 記憶體實體 (Fact)
 */
export class L2Memory extends BaseMemory {
  constructor(
    id: string,
    sessionId: string,
    authorId: string,
    timestamp: number,
    public readonly data: IFactData
  ) {
    super(id, sessionId, 'L2', authorId, timestamp);
  }

  public toDTO(): MemoryDTO<IFactData> {
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
