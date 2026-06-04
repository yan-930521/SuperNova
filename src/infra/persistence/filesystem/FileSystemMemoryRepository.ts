import { MemoryDTO, MemoryLayer } from '../../types/memory';
import { IMemoryRepository } from '../IRepository';
import { recorder } from '../../LogManager';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * FileSystemMemoryRepository (集中化 JSONL 儲存庫)
 * 
 * 儲存架構：
 * <baseDir>/l1.jsonl
 * <baseDir>/l2.jsonl
 * <baseDir>/l3.jsonl
 */
export class FileSystemMemoryRepository implements IMemoryRepository<MemoryDTO> {
  constructor(protected readonly baseDir: string) {}

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {}
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  /**
   * 獲取層級對應的檔案路徑
   */
  private getLayerFilePath(layer: MemoryLayer): string {
    return path.join(this.baseDir, `${layer.toLowerCase()}.jsonl`);
  }

  /**
   * 保存記憶 (追加至 JSONL)
   */
  async save(memory: MemoryDTO): Promise<void> {
    const filePath = this.getLayerFilePath(memory.layer);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const line = JSON.stringify(memory) + '\n';
      await fs.appendFile(filePath, line, 'utf-8');
    } catch (error) {
      recorder.error(`[MemoryRepo] Failed to save memory: ${memory.id}`, { type: 'SYSTEM', payload: { error } });
      throw error;
    }
  }

  /**
   * 根據 ID 載入實體
   * 遍歷 L1, L2, L3 的 JSONL 檔案，返回第一個匹配 ID 的記憶對象
   */
  async load(id: string): Promise<MemoryDTO | null> {
    const layers = [MemoryLayer.L1, MemoryLayer.L2, MemoryLayer.L3];
    for (const layer of layers) {
      const filePath = this.getLayerFilePath(layer);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const memory = JSON.parse(line) as MemoryDTO;
            if (memory.id === id) {
              return memory;
            }
          } catch {}
        }
      } catch (error) {
        // 檔案不存在則繼續搜尋下一層
      }
    }
    return null;
  }

  /**
   * 查找特定會話下的記憶
   */
  async findBySession(sessionId: string, layer: MemoryLayer): Promise<MemoryDTO[]> {
    const filePath = this.getLayerFilePath(layer);
    const results: MemoryDTO[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const memory = JSON.parse(line) as MemoryDTO;
          if (memory.sessionId === sessionId) {
            results.push(memory);
          }
        } catch {}
      }
    } catch (error) {
      // 檔案不存在則返回空列表
    }
    return results;
  }

  /**
   * 獲取特定層級的所有記憶
   */
  async findAllByLayer(layer: MemoryLayer): Promise<MemoryDTO[]> {
    const filePath = this.getLayerFilePath(layer);
    const results: MemoryDTO[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          results.push(JSON.parse(line));
        } catch {}
      }
    } catch (error) {
      // 檔案不存在
    }
    return results;
  }

  /**
   * 獲取 L1 索引 (ID 列表)
   */
  async getL1Index(sessionId: string): Promise<string[]> {
    const l1 = await this.findBySession(sessionId, MemoryLayer.L1);
    return l1.map(m => m.id);
  }

  /**
   * 按命名空間查找 (相容性映射至 findBySession)
   */
  async findByNamespace(namespace: string, sessionId: string): Promise<MemoryDTO[]> {
    const layer = namespace.toUpperCase() as MemoryLayer;
    return this.findBySession(sessionId, layer);
  }

  /**
   * 檢查實體是否存在
   */
  async exists(id: string): Promise<boolean> {
    const memory = await this.load(id);
    return memory !== null;
  }

  // --- IRepository 必需的方法 ---

  async delete(id: string): Promise<void> {
    // 由於 JSONL 追加模式，刪除實作較為複雜，暫不實作
    recorder.warn(`[MemoryRepo] Delete operation is not supported in append-only JSONL mode: ${id}`, { type: 'SYSTEM' });
  }

  async list(): Promise<string[]> {
    const layers = [MemoryLayer.L1, MemoryLayer.L2, MemoryLayer.L3];
    const allIds: string[] = [];
    for (const layer of layers) {
      const memories = await this.findAllByLayer(layer);
      allIds.push(...memories.map(m => m.id));
    }
    return allIds;
  }
}
