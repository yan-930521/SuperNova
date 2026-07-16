import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IDataBlockRepository } from '../IRepository';
import { DataBlock } from '../../../messaging/DataBlock';
import { LogManager } from '../../LogManager';

/**
 * FileSystemDataBlockRepository
 * 基於本地檔案系統的訊息歷史儲存庫實現，所有資料以 JSONL 格式存放在 `workspace/session/{sessionId}/history/{agentId}.jsonl`
 * 實作了 IRepository<DataBlock> 與 IDataBlockRepository 介面。
 */
export class FileSystemDataBlockRepository implements IDataBlockRepository {
  private readonly logger = LogManager.recorder;
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  // --- ILifecycle 實作 ---

  public async initialize(): Promise<void> {
    this.logger.info(`[DataBlockRepository] Initializing storage directory: ${this.baseDir}`);
    if (!existsSync(this.baseDir)) {
      await fs.mkdir(this.baseDir, { recursive: true });
    }
  }

  public async start(): Promise<void> {}
  public async stop(): Promise<void> {}

  // --- IRepository<DataBlock> CRUD 實作 ---

  /**
   * 保存或更新實體 (通用 IRepository 介面)
   * 內部會自動依據 targetId 或 senderId 追加至對應 Agent 歷史檔案中。
   */
  public async save(entity: DataBlock<any>): Promise<void> {
    const agentId = entity.targetId || entity.senderId;
    await this.appendForAgent(entity.sessionId, agentId, entity);
  }

  /**
   * 根據 ID 載入實體
   * 全域搜尋所有會話與 Agent 的歷史 jsonl 檔案，直到找到該 ID。
   */
  public async load(id: string): Promise<DataBlock<any> | null> {
    const files = await this.getAllHistoryFiles();
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const data = JSON.parse(trimmed);
          if (data.id === id) {
            return DataBlock.fromJSON(data);
          }
        }
      } catch (err: any) {
        this.logger.error(`[DataBlockRepository] Error reading line in ${filePath}: ${err.message}`);
      }
    }
    return null;
  }

  /**
   * 刪除實體
   * 在所有歷史 jsonl 檔案中尋找該 ID，若找到則將其從該檔案中移除並覆寫。
   */
  public async delete(id: string): Promise<void> {
    const files = await this.getAllHistoryFiles();
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        let matched = false;
        const newLines: string[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const data = JSON.parse(trimmed);
          if (data.id === id) {
            matched = true;
          } else {
            newLines.push(line);
          }
        }

        if (matched) {
          const finalContent = newLines.length > 0 ? newLines.join('\n') + '\n' : '';
          await fs.writeFile(filePath, finalContent, 'utf-8');
          this.logger.debug(`[DataBlockRepository] Deleted DataBlock ${id} from file ${filePath}`);
          return; // 假設 ID 全局唯一，刪除後即返回
        }
      } catch (err: any) {
        this.logger.error(`[DataBlockRepository] Error modifying file ${filePath}: ${err.message}`);
      }
    }
  }

  /**
   * 列出所有實體的識別碼
   */
  public async list(): Promise<string[]> {
    const files = await this.getAllHistoryFiles();
    const ids: string[] = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const data = JSON.parse(trimmed);
          if (data.id) {
            ids.push(data.id);
          }
        }
      } catch (err: any) {
        this.logger.error(`[DataBlockRepository] Error reading IDs in ${filePath}: ${err.message}`);
      }
    }
    return ids;
  }

  /**
   * 檢查實體是否存在
   */
  public async exists(id: string): Promise<boolean> {
    const entity = await this.load(id);
    return entity !== null;
  }

  // --- IDataBlockRepository 專屬極簡 API 實作 ---

  /**
   * 覆寫特定 Agent 的事件與對話歷史 (以 JSONL 覆寫)
   */
  public async saveForAgent(sessionId: string, agentId: string, blocks: DataBlock<any>[]): Promise<void> {
    const historyDir = await this.ensureHistoryDir(sessionId);
    const historyFilePath = path.join(historyDir, `${agentId}.jsonl`);

    try {
      const lines = blocks.map(b => JSON.stringify(b.toJSON())).join('\n') + '\n';

      // 覆寫寫入
      await fs.writeFile(historyFilePath, lines, 'utf-8');
      this.logger.debug(`[DataBlockRepository] Overwrote history for agent ${agentId} under session ${sessionId}`);
    } catch (err: any) {
      this.logger.error(`[DataBlockRepository] Failed to save history for agent ${agentId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * 追加單筆 DataBlock 至特定 Agent 的歷史末尾 (JSONLine 追加)
   */
  public async appendForAgent(sessionId: string, agentId: string, block: DataBlock<any>): Promise<void> {
    const historyDir = await this.ensureHistoryDir(sessionId);
    const historyFilePath = path.join(historyDir, `${agentId}.jsonl`);

    try {
      const line = JSON.stringify(block.toJSON()) + '\n';

      // 追加寫入
      await fs.appendFile(historyFilePath, line, 'utf-8');
      this.logger.debug(`[DataBlockRepository] Appended history for agent ${agentId} under session ${sessionId}`);
    } catch (err: any) {
      this.logger.error(`[DataBlockRepository] Failed to append history for agent ${agentId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * 讀取並還原特定 Agent 的所有 DataBlock 歷史 (逐行解析 JSONL)
   */
  public async findByAgent(sessionId: string, agentId: string): Promise<DataBlock<any>[]> {
    const historyFilePath = path.join(this.baseDir, sessionId, 'history', `${agentId}.jsonl`);

    if (!existsSync(historyFilePath)) {
      this.logger.debug(`[DataBlockRepository] History file not found: ${historyFilePath}`);
      return [];
    }

    try {
      const content = await fs.readFile(historyFilePath, 'utf-8');
      const lines = content.split('\n');
      const blocks: DataBlock<any>[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed);
          blocks.push(DataBlock.fromJSON(data));
        } catch (parseErr: any) {
          this.logger.error(`[DataBlockRepository] Error parsing line in ${historyFilePath}: ${parseErr.message}`);
        }
      }

      return blocks;
    } catch (err: any) {
      this.logger.error(`[DataBlockRepository] Failed to read history for agent ${agentId}: ${err.message}`);
      throw err;
    }
  }

  // --- 內部輔助方法 ---

  /**
   * 確保歷史目錄存在
   */
  private async ensureHistoryDir(sessionId: string): Promise<string> {
    const historyDir = path.join(this.baseDir, sessionId, 'history');
    if (!existsSync(historyDir)) {
      await fs.mkdir(historyDir, { recursive: true });
    }
    return historyDir;
  }

  /**
   * 獲取基於 baseDir 下所有會話與 Agent 的歷史 jsonl 檔案路徑
   */
  private async getAllHistoryFiles(): Promise<string[]> {
    const historyFiles: string[] = [];
    if (!existsSync(this.baseDir)) return [];

    try {
      const dirs = await fs.readdir(this.baseDir);
      for (const dirName of dirs) {
        const historyDir = path.join(this.baseDir, dirName, 'history');
        if (existsSync(historyDir)) {
          const files = await fs.readdir(historyDir);
          for (const file of files) {
            if (file.endsWith('.jsonl')) {
              historyFiles.push(path.join(historyDir, file));
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`[DataBlockRepository] Failed to read history directories: ${err.message}`);
    }
    return historyFiles;
  }
}
