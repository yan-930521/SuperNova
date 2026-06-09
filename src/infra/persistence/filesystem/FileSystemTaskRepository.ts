import fs from 'node:fs/promises';
import path from 'node:path';

import { Task } from '../../../domain/task/Task';
import { recorder } from '../../LogManager';
import { TaskDTO, TaskStatus } from '../../types/task';
import { ITaskRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';

/**
 * FileSystemTaskRepository
 * 儲存結構：baseDir/sessions/<sessionId>/tasks/<taskId>/data.json
 * 實現會話隔離與快速檢索。
 */
export class FileSystemTaskRepository 
  extends BaseFileSystemRepository<Task> 
  implements ITaskRepository<Task> 
{
  constructor(baseDir: string) {
    super(baseDir, 'TaskRepo');
  }

  /**
   * 取得任務的專屬目錄
   */
  private async getTaskDir(sessionId: string, taskId: string): Promise<string> {
    return await this.getScopedDir(path.join('sessions', sessionId, 'tasks', taskId));
  }

  /**
   * 重寫保存邏輯
   */
  async save(task: Task): Promise<void> {
    if (!task.sessionId) {
      throw new Error(`[TaskRepo] Task ${task.id} is missing sessionId, cannot save.`);
    }
    
    try {
      const taskDir = await this.getTaskDir(task.sessionId, task.id);
      const dataPath = path.join(taskDir, 'data.json');
      const historyPath = path.join(taskDir, 'history.jsonl');

      const dto = task.toDTO();
      const { history, ...metadata } = dto;

      // 1. 存儲元數據 (含 TaskFlow 與 subGraph)
      await fs.writeFile(dataPath, JSON.stringify(metadata, null, 2), 'utf-8');

      // 2. 存儲執行軌跡
      if (history && history.length > 0) {
        const jsonl = history.map(h => JSON.stringify(h)).join('\n') + '\n';
        await fs.writeFile(historyPath, jsonl, 'utf-8');
      }
      
      recorder.debug(`[TaskRepo] Saved task: ${task.id} (Session: ${task.sessionId})`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[TaskRepo] Failed to save task: ${task.id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 重寫載入邏輯：優化遍歷效能
   */
  async load(id: string): Promise<Task | null> {
    try {
      // 由於 ID 唯一，且現在結構更扁平，遍歷 sessions 目錄
      const sessionsPath = path.join(this.baseDir, 'sessions');
      const sessionDirs = await fs.readdir(sessionsPath);
      
      for (const sessionId of sessionDirs) {
        const taskPath = path.join(sessionsPath, sessionId, 'tasks', id);
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
   * 按會話查找：現在可以直接精確定位目錄
   */
  async findBySession(sessionId: string): Promise<Task[]> {
    const tasks: Task[] = [];
    const sessionTasksPath = path.join(this.baseDir, 'sessions', sessionId, 'tasks');
    
    try {
      const taskDirs = await fs.readdir(sessionTasksPath);
      for (const taskId of taskDirs) {
        const taskPath = path.join(sessionTasksPath, taskId);
        const dataPath = path.join(taskPath, 'data.json');
        try {
          const data = await fs.readFile(dataPath, 'utf-8');
          const dto = JSON.parse(data) as TaskDTO;
          const task = Task.fromDTO(dto);
          tasks.push(await this.loadTaskHistory(task, taskPath));
        } catch {
          continue;
        }
      }
    } catch {}
    return tasks;
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
   * 重寫刪除邏輯
   */
  async delete(id: string): Promise<void> {
    // 實作略，需先定位
    recorder.warn(`[TaskRepo] Delete task ${id} is not fully implemented for nested structure`, { type: 'SYSTEM' });
  }
}
