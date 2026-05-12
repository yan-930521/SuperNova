import * as fs from 'fs/promises';
import * as path from 'path';
import { ISnapshotManager } from '../../interfaces/infra/ISnapshotManager';
import { ISession } from '../../interfaces/session/ISession';

/**
 * 基於文件的快照管理器實作
 */
export class FileSnapshotManager implements ISnapshotManager {
  constructor(private storageDir: string = path.join(process.cwd(), '.supernova/snapshots')) {}

  /**
   * 建立快照
   */
  async snapshot(session: ISession, metadata: Record<string, any>): Promise<string> {
    const sessionId = session.id;
    const sessionDir = path.join(this.storageDir, sessionId);
    
    // 確保目錄存在
    await fs.mkdir(sessionDir, { recursive: true });

    // 生成快照 ID (使用時間戳與任務索引)
    const timestamp = Date.now();
    const taskIndex = metadata.taskIndex || 0;
    const snapshotId = `${taskIndex.toString().padStart(3, '0')}_${timestamp}`;
    
    const snapshotData = {
      metadata: {
        ...metadata,
        timestamp,
        snapshotId
      },
      session: session.toJSON()
    };

    const finalPath = path.join(sessionDir, `${snapshotId}.json`);
    const tempPath = `${finalPath}.tmp`;

    // 原子寫入：先寫臨時文件再更名
    await fs.writeFile(tempPath, JSON.stringify(snapshotData, null, 2), 'utf-8');
    await fs.rename(tempPath, finalPath);

    // 更新 metadata.json (索引)
    await this.updateMetadataIndex(sessionDir, snapshotId, metadata);

    return snapshotId;
  }

  /**
   * 回滾會話
   */
  async rollback(session: ISession, checkpointId: string): Promise<void> {
    const sessionDir = path.join(this.storageDir, session.id);
    const snapshotPath = path.join(sessionDir, `${checkpointId}.json`);

    try {
      const data = JSON.parse(await fs.readFile(snapshotPath, 'utf-8'));
      await session.loadFromJSON(data.session);
    } catch (error) {
      throw new Error(`Failed to rollback session ${session.id} to ${checkpointId}: ${error}`);
    }
  }

  /**
   * 獲取最新快照 ID
   */
  async getLatestSnapshotId(sessionId: string): Promise<string | null> {
    const sessionDir = path.join(this.storageDir, sessionId);
    const indexPath = path.join(sessionDir, 'metadata.json');

    try {
      const index = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
      return index.latestSnapshotId || null;
    } catch (error) {
      // 如果沒有索引，嘗試列出目錄
      try {
        const files = await fs.readdir(sessionDir);
        const snapshotFiles = files.filter(f => f.endsWith('.json') && f !== 'metadata.json').sort();
        if (snapshotFiles.length > 0) {
          return snapshotFiles[snapshotFiles.length - 1].replace('.json', '');
        }
      } catch (e) {
        return null;
      }
      return null;
    }
  }

  /**
   * 更新元數據索引文件
   */
  private async updateMetadataIndex(sessionDir: string, snapshotId: string, metadata: Record<string, any>): Promise<void> {
    const indexPath = path.join(sessionDir, 'metadata.json');
    let index: any = { snapshots: [] };

    try {
      index = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
    } catch (error) {
      // 索引不存在，忽略
    }

    index.latestSnapshotId = snapshotId;
    index.lastUpdated = new Date().toISOString();
    index.snapshots.push({
      id: snapshotId,
      timestamp: Date.now(),
      metadata
    });

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }
}
