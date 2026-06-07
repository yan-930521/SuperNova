import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { L1Memory } from '../../domain/memory/L1Memory';
import { L2Memory } from '../../domain/memory/L2Memory';
import { L3Memory } from '../../domain/memory/L3Memory';
import { recorder } from '../../infra/LogManager';
import { IMemoryRepository } from '../../infra/persistence/IRepository';
import {
    IBlackboardPointer, IFactData, ISOPData, MemoryDTO, MemoryLayer
} from '../../infra/types/memory';

/**
 * MemoryService (記憶服務 - L1/L2/L3 中央管理者)
 * 
 * 內部維護三個獨立的 Map 列表，所有層級皆按 SessionID 進行隔離。
 * L1: 會話指針索引 (Blackboard)
 * L2: 事實層 (Facts)
 * L3: SOP 層 (SOPs)
 */
export class MemoryService implements ILifecycle {
  // L1: sessionId -> key -> L1Memory
  private l1 = new Map<string, Map<string, L1Memory>>();
  // L2: id -> L2Memory
  private l2 = new Map<string, Map<string, L2Memory>>();
  // L3: id -> L3Memory
  private l3 = new Map<string, Map<string, L3Memory>>();

  constructor(
    private readonly memoryRepo: IMemoryRepository<MemoryDTO>
  ) { }

  async initialize(): Promise<void> {
    recorder.info('[MemoryService] Initialized with 3 independent session maps', { type: 'SYSTEM' });
  }

  async start(): Promise<void> { }
  async stop(): Promise<void> {
    this.l1.clear();
    this.l2.clear();
    this.l3.clear();
  }

  // --- L1 Blackboard 操作 ---
  async saveL1Memory(
    sessionId: string,
    key: string,
    pointerId: string,
    description: string,
    authorId: string
  ): Promise<L1Memory> {
    const id = key; // L1 以 key 為 ID 實現自動覆蓋
    const data: IBlackboardPointer = { key, pointerId, description };
    const memory = new L1Memory(id, sessionId, authorId, Date.now(), data);

    if (!this.l1.has(sessionId)) {
      this.l1.set(sessionId, new Map());
    }
    this.l1.get(sessionId)!.set(key, memory);

    await this.memoryRepo.save(memory.toDTO());
    return memory;
  }

  // --- L2 / L3 操作 ---

  async saveL2Memory(sessionId: string, dto: MemoryDTO<IFactData>): Promise<void> {
    if (!this.l2.has(sessionId)) this.l2.set(sessionId, new Map());
    const memory = new L2Memory(dto.id, sessionId, dto.authorId, dto.timestamp, dto.data);
    this.l2.get(sessionId)!.set(dto.id, memory);
    await this.memoryRepo.save(dto);
  }

  async saveL3Memory(sessionId: string, dto: MemoryDTO<ISOPData>): Promise<void> {
    if (!this.l3.has(sessionId)) this.l3.set(sessionId, new Map());
    const memory = new L3Memory(dto.id, sessionId, dto.authorId, dto.timestamp, dto.data);
    this.l3.get(sessionId)!.set(dto.id, memory);
    await this.memoryRepo.save(dto);
  }

  // --- 通用存取接口 ---
  /**
   * 目前L1 ~ L3是跨session共用的
   */
  async getMemory(sessionId: string, id: string): Promise<MemoryDTO | null> {
    // 依序搜尋各層級
    const l1 = this.l1.get(sessionId)?.get(id);
    if (l1) return l1.toDTO();

    const l2 = this.l2.get(sessionId)?.get(id);
    if (l2) return l2.toDTO();

    const l3 = this.l3.get(sessionId)?.get(id);
    if (l3) return l3.toDTO();

    return null;
  }

  /**
   * 恢復會話記憶
   */
  async restoreSession(sessionId: string): Promise<void> {
    let total = 0;

    // 恢復 L1
    const l1Dtos = await this.memoryRepo.findBySession(sessionId, MemoryLayer.L1);
    if (l1Dtos.length > 0) {
      if (!this.l1.has(sessionId)) this.l1.set(sessionId, new Map());
      l1Dtos.forEach(dto => {
        const data = dto.data as IBlackboardPointer;
        this.l1.get(sessionId)!.set(data.key, new L1Memory(dto.id, sessionId, dto.authorId, dto.timestamp, data));
      });
      total += l1Dtos.length;
    }

    // 恢復 L2
    const l2Dtos = await this.memoryRepo.findBySession(sessionId, MemoryLayer.L2);
    if (l2Dtos.length > 0) {
      if (!this.l2.has(sessionId)) this.l2.set(sessionId, new Map());
      l2Dtos.forEach(dto => {
        this.l2.get(sessionId)!.set(dto.id, new L2Memory(dto.id, sessionId, dto.authorId, dto.timestamp, dto.data));
      });
      total += l2Dtos.length;
    }

    // 恢復 L3
    const l3Dtos = await this.memoryRepo.findBySession(sessionId, MemoryLayer.L3);
    if (l3Dtos.length > 0) {
      if (!this.l3.has(sessionId)) this.l3.set(sessionId, new Map());
      l3Dtos.forEach(dto => {
        this.l3.get(sessionId)!.set(dto.id, new L3Memory(dto.id, sessionId, dto.authorId, dto.timestamp, dto.data));
      });
      total += l3Dtos.length;
    }

    recorder.info(`[MemoryService] Restored session ${sessionId}: ${total} items`, { type: 'SYSTEM' });
  }
}
