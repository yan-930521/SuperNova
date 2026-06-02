import { Task } from '../../../domain/task/Task';
import { ITaskRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';
import { recorder } from '../../LogManager';
import { TaskDTO, TaskStatus } from '../../types/task';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * FileSystemTaskRepository
 * 儲存結構：baseDir/<chainId>/<taskId>/data.json
 * 保留原始的鏈式層級存儲邏輯，並在讀取時將 DTO 轉換為 Task 實體。
 */
export class FileSystemTaskRepository 
  extends BaseFileSystemRepository<Task> 
  implements ITaskRepository<Task> 
{
  constructor(baseDir: string) {
    super(baseDir, 'TaskRepo');
  }

  /**
   * 確保任務目錄存在
   */
  private async ensureTaskDir(chainId: string, taskId: string): Promise<string> {
    const taskDir = path.join(this.baseDir, chainId, taskId);
    await fs.mkdir(taskDir, { recursive: true });
    return taskDir;
  }

  /**
   * 重寫保存邏輯：將 Task 實體轉換為 DTO 後存儲
   */
  async save(task: Task): Promise<void> {
    if (!task.chainId) {
      throw new Error(`[TaskRepo] Task ${task.id} is missing chainId, cannot save.`);
    }
    
    try {
      const taskDir = await this.ensureTaskDir(task.chainId, task.id);
      const dataPath = path.join(taskDir, 'data.json');
      const historyPath = path.join(taskDir, 'history.jsonl');

      // 取得 DTO 數據
      const dto = task.toDTO();
      const { history, ...metadata } = dto;

      // 1. 存儲元數據
      await fs.writeFile(dataPath, JSON.stringify(metadata, null, 2), 'utf-8');

      // 2. 初始化歷史檔案 (僅當歷史存在且檔案尚未建立時)
      if (history && history.length > 0) {
        try {
          await fs.access(historyPath);
        } catch {
          const jsonl = history.map(h => JSON.stringify(h)).join('\n') + '\n';
          await fs.writeFile(historyPath, jsonl, 'utf-8');
        }
      }
      recorder.debug(`[TaskRepo] Saved task: ${task.id} in chain: ${task.chainId}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[TaskRepo] Failed to save task: ${task.id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 重寫載入邏輯：讀取 DTO 並還原為 Task 實體
   */
  async load(id: string): Promise<Task | null> {
    try {
      const chainDirs = await fs.readdir(this.baseDir);
      for (const chainDir of chainDirs) {
        const taskPath = path.join(this.baseDir, chainDir, id);
        const dataPath = path.join(taskPath, 'data.json');
        
        try {
          const data = await fs.readFile(dataPath, 'utf-8');
          const dto = JSON.parse(data) as TaskDTO;
          const task = Task.fromDTO(dto);
          return await this.loadTaskHistory(task, taskPath);
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * 輔助方法：加載並還原任務的歷史紀錄
   */
  private async loadTaskHistory(task: Task, taskDir: string): Promise<Task> {
    const historyPath = path.join(taskDir, 'history.jsonl');
    try {
      const rawHistory = await fs.readFile(historyPath, 'utf-8');
      const history = rawHistory
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(item => item !== null);
      
      task.setHistory(history);
    } catch {
      // 無歷史紀錄
    }
    return task;
  }

  /**
   * 按會話查找所有任務
   */
  async findBySession(sessionId: string): Promise<Task[]> {
    const tasks: Task[] = [];
    try {
      const chainDirs = await fs.readdir(this.baseDir);
      for (const chainDir of chainDirs) {
        const chainPath = path.join(this.baseDir, chainDir);
        const taskDirs = await fs.readdir(chainPath);
        for (const taskDir of taskDirs) {
          const taskPath = path.join(chainPath, taskDir);
          const dataPath = path.join(taskPath, 'data.json');
          try {
            const data = await fs.readFile(dataPath, 'utf-8');
            const dto = JSON.parse(data) as TaskDTO;
            if (dto.sessionId === sessionId) {
              const task = Task.fromDTO(dto);
              tasks.push(await this.loadTaskHistory(task, taskPath));
            }
          } catch {
            continue;
          }
        }
      }
    } catch {}
    return tasks;
  }

  /**
   * 重寫刪除邏輯
   */
  async delete(id: string): Promise<void> {
    // 實作略，需先定位 chainId
    recorder.warn(`[TaskRepo] Delete task ${id} is not fully implemented for nested structure`, { type: 'SYSTEM' });
  }
}
