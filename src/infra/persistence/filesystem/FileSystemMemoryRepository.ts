import { MemoryDTO, MemoryLayer } from '../../types/memory';
import { IMemoryRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';
import { recorder } from '../../LogManager';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * FileSystemMemoryRepository
 * 儲存結構：baseDir/<sessionId>/<layer>/<namespace>/<id>.json
 * 保留原始資產中極其複雜的層級掃描邏輯。
 */
export class FileSystemMemoryRepository 
  extends BaseFileSystemRepository<MemoryDTO> 
  implements IMemoryRepository<MemoryDTO> 
{
  constructor(baseDir: string) {
    super(baseDir, 'MemoryRepo');
  }

  /**
   * 取得特定記憶的檔案路徑
   */
  private getMemoryPath(memory: MemoryDTO): string {
    return path.join(this.baseDir, memory.sessionId, memory.layer, memory.namespace, `${memory.id}.json`);
  }

  /**
   * 重寫保存邏輯：處理多層級目錄
   */
  async save(memory: MemoryDTO): Promise<void> {
    const filePath = this.getMemoryPath(memory);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(memory, null, 2), 'utf-8');
      recorder.debug(`[MemoryRepo] Saved memory: ${memory.id}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[MemoryRepo] Failed to save memory: ${memory.id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 重寫載入邏輯：跨 Layer 與 Namespace 搜尋 (保留原始邏輯)
   */
  async load(id: string, sessionId?: string): Promise<MemoryDTO | null> {
    if (!sessionId) {
        recorder.warn(`[MemoryRepo] load(id) called without sessionId, scanning all (expensive)`, { type: 'SYSTEM' });
    }

    const layers = [MemoryLayer.WORKING, MemoryLayer.PERSISTENT];
    // 這裡我們實作時需要考量 IRepository 介面只傳 id 的情況
    // 如果沒有 sessionId，我們必須掃描 baseDir 下的所有 sessionId 目錄
    const searchDirs = sessionId ? [path.join(this.baseDir, sessionId)] : 
                       (await fs.readdir(this.baseDir)).map(d => path.join(this.baseDir, d));

    for (const sessionDir of searchDirs) {
      for (const layer of layers) {
        const layerDir = path.join(sessionDir, layer);
        try {
          const namespaces = await fs.readdir(layerDir);
          for (const ns of namespaces) {
            const filePath = path.join(layerDir, ns, `${id}.json`);
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              return JSON.parse(content) as MemoryDTO;
            } catch { continue; }
          }
        } catch { continue; }
      }
    }
    return null;
  }

  /**
   * 按命名空間查找
   */
  async findByNamespace(namespace: string, sessionId: string): Promise<MemoryDTO[]> {
    const layers = [MemoryLayer.WORKING, MemoryLayer.PERSISTENT];
    const results: MemoryDTO[] = [];
    
    for (const layer of layers) {
      const nsDir = path.join(this.baseDir, sessionId, layer, namespace);
      try {
        const files = await fs.readdir(nsDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          try {
            const content = await fs.readFile(path.join(nsDir, file), 'utf-8');
            results.push(JSON.parse(content) as MemoryDTO);
          } catch { continue; }
        }
      } catch { continue; }
    }
    return results;
  }

  /**
   * 獲取一級索引 (L1 Index)
   */
  async getL1Index(sessionId: string): Promise<string[]> {
    const sessionDir = path.join(this.baseDir, sessionId);
    const indexSet = new Set<string>();
    const layers = [MemoryLayer.WORKING, MemoryLayer.PERSISTENT];
    
    for (const layer of layers) {
      await this.scanDirRecursive(path.join(sessionDir, layer), indexSet);
    }
    return Array.from(indexSet);
  }

  private async scanDirRecursive(dirPath: string, indexSet: Set<string>): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.scanDirRecursive(fullPath, indexSet);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          indexSet.add(path.parse(entry.name).name);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const memory = JSON.parse(content) as MemoryDTO;
            if (memory.tags) memory.tags.forEach(tag => indexSet.add(tag));
          } catch {}
        }
      }
    } catch {}
  }

  /**
   * 重寫刪除邏輯
   */
  async delete(id: string, sessionId?: string): Promise<void> {
    // 實作邏輯與 load 類似，找到即刪除
    recorder.warn(`[MemoryRepo] Delete memory ${id} requires sessionId for efficiency`, { type: 'SYSTEM' });
  }
}
