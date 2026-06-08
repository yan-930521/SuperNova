import { MemoryDTO, MemoryLayer } from '../../types/memory';
import { IMemoryRepository } from '../IRepository';
import { recorder } from '../../LogManager';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * FileSystemMemoryRepository
 * 
 * 實作分層存儲與會話隔離：
 * - L1: sessions/<sessionId>/blackboard.json (單一 JSON)
 * - L2 Session: sessions/<sessionId>/L2_session/facts.jsonl
 * - L2 Global: memory/L2_global/facts.jsonl
 * - L3: memory/L3_sops/ (SOP 標準庫)
 */
export class FileSystemMemoryRepository implements IMemoryRepository<MemoryDTO> {
  constructor(protected readonly baseDir: string) {}

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.mkdir(path.join(this.baseDir, 'memory', 'L2_global'), { recursive: true });
      await fs.mkdir(path.join(this.baseDir, 'memory', 'L3_sops'), { recursive: true });
    } catch (error) {}
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  /**
   * 獲取精確的檔案路徑 (基於層級與作用域)
   */
  private getMemoryPath(memory: MemoryDTO): string {
    const { layer, sessionId } = memory;

    if (layer === 'L1') {
      return path.join(this.baseDir, 'sessions', sessionId, 'blackboard.json');
    }

    if (layer === 'L2') {
      // 判定是 Session 還是 Global
      if (sessionId && sessionId !== 'global') {
        return path.join(this.baseDir, 'sessions', sessionId, 'L2_session', 'facts.jsonl');
      }
      return path.join(this.baseDir, 'memory', 'L2_global', 'facts.jsonl');
    }

    if (layer === 'L3') {
      return path.join(this.baseDir, 'memory', 'L3_sops', `${memory.id}.json`);
    }

    throw new Error(`[MemoryRepo] Unsupported memory layer: ${layer}`);
  }

  /**
   * 保存記憶
   */
  async save(memory: MemoryDTO): Promise<void> {
    const filePath = this.getMemoryPath(memory);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // L1 採用覆蓋式寫入 (JSON)
      if (memory.layer === 'L1') {
        // 先讀取現有黑板，併入新數據
        let blackboard: Record<string, any> = {};
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          blackboard = JSON.parse(content);
        } catch {}
        
        blackboard[memory.id] = memory;
        await fs.writeFile(filePath, JSON.stringify(blackboard, null, 2), 'utf-8');
      } 
      // L2 採用追加式寫入 (JSONL)
      else if (memory.layer === 'L2') {
        const line = JSON.stringify(memory) + '\n';
        await fs.appendFile(filePath, line, 'utf-8');
      }
      // L3 採用單一檔案 (JSON)
      else {
        await fs.writeFile(filePath, JSON.stringify(memory, null, 2), 'utf-8');
      }
    } catch (error) {
      recorder.error(`[MemoryRepo] Failed to save memory: ${memory.id}`, { type: 'SYSTEM', payload: { error } });
      throw error;
    }
  }

  /**
   * 載入記憶 (僅支援 ID 檢索，需遍歷或指定作用域)
   */
  async load(id: string): Promise<MemoryDTO | null> {
    // 優先從 L3 找 (單一檔案最快)
    const l3Path = path.join(this.baseDir, 'memory', 'L3_sops', `${id}.json`);
    try {
      const data = await fs.readFile(l3Path, 'utf-8');
      return JSON.parse(data) as MemoryDTO;
    } catch {}

    // 其他層級需要知道 sessionId，load 介面受限，需全局搜尋 (TODO: 優化)
    recorder.warn(`[MemoryRepo] Global 'load' by ID is inefficient, consider findBySession`, { type: 'SYSTEM' });
    return null;
  }

  /**
   * 查找特定會話下的記憶 (遵循優先級：L1 -> L2S -> L2G)
   */
  async findBySession(sessionId: string, layer: MemoryLayer): Promise<MemoryDTO[]> {
    const results: MemoryDTO[] = [];

    if (layer === 'L1') {
      const filePath = path.join(this.baseDir, 'sessions', sessionId, 'blackboard.json');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const blackboard = JSON.parse(content);
        return Object.values(blackboard);
      } catch { return []; }
    }

    if (layer === 'L2') {
      // 1. 讀取 Session L2
      const sPath = path.join(this.baseDir, 'sessions', sessionId, 'L2_session', 'facts.jsonl');
      results.push(...(await this.readJsonl(sPath)));
      
      // 2. 讀取 Global L2
      const gPath = path.join(this.baseDir, 'memory', 'L2_global', 'facts.jsonl');
      results.push(...(await this.readJsonl(gPath)));
    }

    return results;
  }

  /**
   * 輔助方法：讀取 JSONL
   */
  private async readJsonl(filePath: string): Promise<MemoryDTO[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.split('\n')
        .filter(l => l.trim())
        .map(line => JSON.parse(line) as MemoryDTO);
    } catch {
      return [];
    }
  }

  /**
   * 獲取 L1 索引 (Key 列表)
   */
  async getL1Index(sessionId: string): Promise<string[]> {
    const l1 = await this.findBySession(sessionId, 'L1');
    return l1.map(m => m.id);
  }

  // --- 其他介面實作 ---

  async findAllByLayer(layer: MemoryLayer): Promise<MemoryDTO[]> {
    if (layer === 'L2') {
      const gPath = path.join(this.baseDir, 'memory', 'L2_global', 'facts.jsonl');
      return await this.readJsonl(gPath);
    }
    return [];
  }

  async exists(id: string): Promise<boolean> {
    const mem = await this.load(id);
    return mem !== null;
  }

  async delete(id: string): Promise<void> {
    recorder.warn(`[MemoryRepo] Delete not implemented`, { type: 'SYSTEM' });
  }

  async list(): Promise<string[]> {
    return [];
  }

  async findByNamespace(namespace: string, sessionId: string): Promise<MemoryDTO[]> {
    return this.findBySession(sessionId, namespace as any);
  }
}
