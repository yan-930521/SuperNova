import * as fs from 'fs/promises';
import * as path from 'path';

import { ITaskRepository, TaskDTO } from '../types/task';

/**
 * 基於檔案系統的任務儲存庫實作
 * 將任務以 JSON 格式儲存在指定目錄的檔案中。
 */
export class FileSystemTaskRepository implements ITaskRepository {
  /**
   * 初始化檔案系統任務儲存庫
   * @param baseDir 基礎儲存目錄
   */
  constructor(private baseDir: string) {
  }

  /**
   * 確保任務目錄存在
   */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /**
   * 保存或更新任務狀態
   * @param task 任務數據對象
   */
  async save(task: TaskDTO): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.baseDir, `${task.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf-8');
  }

  /**
   * 獲取指定會話下的所有任務
   * @param sessionId 會話識別碼
   */
  async findBySession(sessionId: string): Promise<TaskDTO[]> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(this.baseDir);
      const tasks: TaskDTO[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const data = await fs.readFile(path.join(this.baseDir, file), 'utf-8');
          const task = JSON.parse(data) as TaskDTO;
          if (task.sessionId === sessionId) {
            tasks.push(task);
          }
        } catch (err) {
          // 忽略損壞的檔案
          continue;
        }
      }
      return tasks;
    } catch (err) {
      return [];
    }
  }

  /**
   * 根據 ID 查找單一任務
   * @param id 任務識別碼
   */
  async findById(id: string): Promise<TaskDTO | null> {
    const filePath = path.join(this.baseDir, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as TaskDTO;
    } catch (err) {
      return null;
    }
  }
}
