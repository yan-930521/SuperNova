import * as fs from 'fs/promises';
import * as path from 'path';
import { IMemoryRepository, MemoryDTO, MemoryLayer } from '../types/memory';

/**
 * FileSystemMemoryRepository
 * 實作基於檔案系統的記憶儲存庫。
 * 
 * 儲存結構：
 * baseDir/<sessionId>/<layer>/<namespace>/<id>.json
 */
export class FileSystemMemoryRepository implements IMemoryRepository {
  /**
   * @param baseDir 記憶存儲的根目錄 (例如: workspace/memory/)
   */
  constructor(private baseDir: string) { }

  /**
   * 確保目標目錄存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * 構建記憶檔案路徑
   */
  private getFilePath(memory: Partial<MemoryDTO> & { sessionId: string; layer: string; namespace: string; id: string }): string {
    return path.join(this.baseDir, memory.sessionId, memory.layer, memory.namespace, `${memory.id}.json`);
  }

  /**
   * 保存或更新記憶
   */
  async save(memory: MemoryDTO): Promise<void> {
    const filePath = this.getFilePath(memory);
    const dirPath = path.dirname(filePath);
    
    await this.ensureDir(dirPath);
    await fs.writeFile(filePath, JSON.stringify(memory, null, 2), 'utf-8');
  }

  /**
   * 根據 ID 查找記憶
   */
  async findById(id: string, sessionId: string): Promise<MemoryDTO | null> {
    // 由於路徑包含 layer 和 namespace，而 findById 只提供了 id 和 sessionId，
    // 我們需要遍歷 WORKING 和 PERSISTENT 目錄來尋找該 ID。
    const layers = [MemoryLayer.WORKING, MemoryLayer.PERSISTENT];
    
    for (const layer of layers) {
      const layerDir = path.join(this.baseDir, sessionId, layer);
      try {
        const namespaces = await fs.readdir(layerDir);
        for (const ns of namespaces) {
          const filePath = path.join(layerDir, ns, `${id}.json`);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as MemoryDTO;
          } catch {
            // 檔案不存在，繼續尋找
          }
        }
      } catch {
        // 目錄不存在，繼續尋找下一個 layer
      }
    }
    
    return null;
  }

  /**
   * 根據命名空間查找特定會話的所有記憶
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
          } catch {
            // 讀取錯誤
          }
        }
      } catch {
        // 目錄不存在
      }
    }
    
    return results;
  }

  /**
   * 刪除特定記憶
   */
  async delete(id: string, sessionId: string): Promise<void> {
    const layers = [MemoryLayer.WORKING, MemoryLayer.PERSISTENT];
    
    for (const layer of layers) {
      const layerDir = path.join(this.baseDir, sessionId, layer);
      try {
        const namespaces = await fs.readdir(layerDir);
        for (const ns of namespaces) {
          const filePath = path.join(layerDir, ns, `${id}.json`);
          try {
            await fs.unlink(filePath);
            return; // 找到並刪除後即可返回
          } catch {
            // 檔案不存在
          }
        }
      } catch {
        // 目錄不存在
      }
    }
  }

  /**
   * 獲取一級索引 (L1 Index)
   * 掃描會話下的可用標籤或 ID 列表。
   */
  async getL1Index(sessionId: string): Promise<string[]> {
    const sessionDir = path.join(this.baseDir, sessionId);
    const indexSet = new Set<string>();
    const layers = [MemoryLayer.WORKING, MemoryLayer.PERSISTENT];
    
    for (const layer of layers) {
      const layerDir = path.join(sessionDir, layer);
      try {
        await this.scanDirRecursive(layerDir, indexSet);
      } catch {
        // 目錄不存在
      }
    }
    
    return Array.from(indexSet);
  }

  /**
   * 遞迴掃描目錄並蒐集 ID 與 Tags
   */
  private async scanDirRecursive(dirPath: string, indexSet: Set<string>): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.scanDirRecursive(fullPath, indexSet);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          // 添加 ID (不含副檔名)
          const id = path.parse(entry.name).name;
          indexSet.add(id);
          
          // 讀取檔案以獲取標籤
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const memory = JSON.parse(content) as MemoryDTO;
            if (memory.tags && Array.isArray(memory.tags)) {
              memory.tags.forEach(tag => indexSet.add(tag));
            }
          } catch {
            // 讀取錯誤
          }
        }
      }
    } catch {
      // 目錄不存在或無法讀取
    }
  }
}
