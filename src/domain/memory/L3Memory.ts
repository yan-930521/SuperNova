import { BaseMemory } from './BaseMemory';
import { MemoryLayer, MemoryDTO, ISOPData } from '../../infra/types/memory';

/**
 * L3 記憶體實體 (SOP)
 */
export class L3Memory extends BaseMemory {
  constructor(
    id: string,
    sessionId: string,
    authorId: string,
    timestamp: number,
    public readonly data: ISOPData
  ) {
    super(id, sessionId, 'L3', authorId, timestamp);
  }

  public toDTO(): MemoryDTO<ISOPData> {
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
