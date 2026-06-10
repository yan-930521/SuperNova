import fs from 'node:fs/promises';
import path from 'node:path';

import { Task } from '../../../domain/task/Task';
import { GlobalRuntime } from '../../../runtime/GlobalRuntime';
import { recorder } from '../../LogManager';
import { TaskDTO, TaskStatus } from '../../types/task';
import { ITaskRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';

/**
 * FileSystemTaskRepository - SuperNova 0.4.5
 * 職責: 負責任務實體的持久化，採用「分形儲存」結構。
 * 結構: baseDir/sessions/<sessionId>/tasks/<taskId>/data.json
 *      子任務則存在於母任務的 subtasks/ 目錄下。
 */
export class FileSystemTaskRepository 
  extends BaseFileSystemRepository<Task> 
  implements ITaskRepository<Task> 
{
  constructor(baseDir: string) {
    super(baseDir, 'TaskRepo');
  }

  /**
   * 取得任務的專屬目錄 (遞迴定位)
   * 邏輯：根據是否具備母任務 ID 決定路徑。
   */
  private async getTaskDir(sessionId: string, taskId: string, parentTaskId?: string): Promise<string> {
    const sessionDir = path.join('sessions', sessionId, 'tasks');
    
    let targetPath: string;
    if (!parentTaskId) {
      targetPath = path.join(sessionDir, taskId);
    } else {
      // 子任務路徑: sessions/<sessionId>/tasks/<parentTaskId>/subtasks/<taskId>
      targetPath = path.join(sessionDir, parentTaskId, 'subtasks', taskId);
    }
    
    return await this.getScopedDir(targetPath);
  }

  /**
   * 保存任務實體
   * 採用原子寫入策略：先寫入臨時文件再移動，防止寫入中斷導致損壞。
   */
  async save(task: Task): Promise<void> {
    if (!task.sessionId) {
      throw new Error(`[TaskRepo] Task ${task.id} is missing sessionId, cannot save.`);
    }
    
    const taskDir = await this.getTaskDir(task.sessionId, task.id, task.parentTaskId);
    const dataPath = path.join(taskDir, 'data.json');
    const historyPath = path.join(taskDir, 'history.jsonl');

    try {
      const dto = task.toDTO();
      const { history, ...metadata } = dto;

      // 1. 原子化保存元數據
      const tempPath = `${dataPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf-8');
      await fs.rename(tempPath, dataPath);

      // 2. 保存執行軌跡 (JSONL 格式)
      if (history && history.length > 0) {
        const jsonl = history.map(h => JSON.stringify(h)).join('\n') + '\n';
        await fs.writeFile(historyPath, jsonl, 'utf-8');
      }
      
      recorder.debug(`[TaskRepo] Task saved: ${task.id}`, { type: 'SYSTEM', task_id: task.id });
    } catch (error) {
      recorder.error(`[TaskRepo] Save failed: ${task.id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 根據 ID 載入任務
   * 由於採用分形結構且 load 介面僅提供 ID，需進行全局掃描。
   * 優化：採用並行掃描加速。
   */
  async load(id: string): Promise<Task | null> {
    try {
      const sessionsPath = path.join(this.baseDir, 'sessions');
      // 若 sessions 目錄不存在，直接返回
      try { await fs.access(sessionsPath); } catch { return null; }

      const sessionDirs = await fs.readdir(sessionsPath);
      
      // 並行查找所有會話
      const tasks = await Promise.all(sessionDirs.map(async (sessionId) => {
        const tasksPath = path.join(sessionsPath, sessionId, 'tasks');
        try {
          const rootDirs = await fs.readdir(tasksPath);
          for (const rootId of rootDirs) {
            // 1. 檢查根任務
            if (rootId === id) {
              return await this.loadFromPath(path.join(tasksPath, rootId));
            }
            // 2. 檢查子任務 (假設目前僅一層嵌套，若需多層則需遞迴)
            const subTaskPath = path.join(tasksPath, rootId, 'subtasks', id);
            const task = await this.loadFromPath(subTaskPath);
            if (task) return task;
          }
        } catch { return null; }
        return null;
      }));

      return tasks.find(t => t !== null) || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 從特定目錄加載任務實體
   */
  private async loadFromPath(taskPath: string): Promise<Task | null> {
    const dataPath = path.join(taskPath, 'data.json');
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      const dto = JSON.parse(data) as TaskDTO;
      const task = Task.fromDTO(dto);
      
      // 嘗試加載歷史軌跡
      const historyPath = path.join(taskPath, 'history.jsonl');
      try {
        const rawHistory = await fs.readFile(historyPath, 'utf-8');
        const history = rawHistory
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
        task.setHistory(history);
      } catch { /* 無歷史 */ }

      return task;
    } catch {
      return null;
    }
  }

  /**
   * 按會話查找根任務 (母任務)
   */
  async findRootsBySession(sessionId: string): Promise<Task[]> {
    const sessionTasksPath = path.join(this.baseDir, 'sessions', sessionId, 'tasks');
    
    try {
      const rootIds = await fs.readdir(sessionTasksPath);
      const loaded = await Promise.all(rootIds.map(id => this.loadFromPath(path.join(sessionTasksPath, id))));
      return loaded.filter((t): t is Task => t !== null);
    } catch {
      return [];
    }
  }

  /**
   * 按會話查找所有任務 (包含子任務)
   */
  async findBySession(sessionId: string): Promise<Task[]> {
    const tasks: Task[] = [];
    const sessionTasksPath = path.join(this.baseDir, 'sessions', sessionId, 'tasks');
    
    try {
      const rootIds = await fs.readdir(sessionTasksPath);
      for (const rootId of rootIds) {
        const rootTask = await this.loadFromPath(path.join(sessionTasksPath, rootId));
        if (rootTask) {
          tasks.push(rootTask);
          
          // 載入子任務
          const subTasksPath = path.join(sessionTasksPath, rootId, 'subtasks');
          try {
            const subIds = await fs.readdir(subTasksPath);
            const subs = await Promise.all(subIds.map(sid => this.loadFromPath(path.join(subTasksPath, sid))));
            tasks.push(...subs.filter((t): t is Task => t !== null));
          } catch {}
        }
      }
    } catch {}
    return tasks;
  }

  /**
   * 按狀態查找任務
   */
  async findTasksByStatus(status: TaskStatus): Promise<Task[]> {
    const allActive = await this.findAllActiveTasks();
    return allActive.filter(t => t.status === status);
  }

  /**
   * 獲取所有活躍任務 (非封存)
   */
  async findAllActiveTasks(): Promise<Task[]> {
    const sessionsPath = path.join(this.baseDir, GlobalRuntime.getInstance().config.storage.sessions_dir);
    try {
      const sessionDirs = await fs.readdir(sessionsPath);
      const tasksPerSession = await Promise.all(sessionDirs.map(sid => this.findBySession(sid)));
      return tasksPerSession.flat().filter(t => t.status !== 'archived');
    } catch {
      return [];
    }
  }

  /**
   * 實作 IRepository.list() - 獲取所有任務 ID
   */
  async list(): Promise<string[]> {
    const sessionsPath = path.join(this.baseDir, 'sessions');
    try {
      const sessionDirs = await fs.readdir(sessionsPath);
      const idSets = await Promise.all(sessionDirs.map(async (sid) => {
        const tasks = await this.findBySession(sid);
        return tasks.map(t => t.id);
      }));
      return idSets.flat();
    } catch {
      return [];
    }
  }

  /**
   * 刪除任務及其相關目錄
   */
  async delete(id: string): Promise<void> {
    try {
      // 1. 定位任務目錄
      const task = await this.load(id);
      if (!task) return;

      const taskDir = await this.getTaskDir(task.sessionId, task.id, task.parentTaskId);
      
      // 2. 遞迴刪除目錄
      await fs.rm(taskDir, { recursive: true, force: true });
      recorder.info(`[TaskRepo] Task deleted: ${id}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[TaskRepo] Delete failed: ${id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  /**
   * 檢查任務是否存在
   */
  async exists(id: string): Promise<boolean> {
    return (await this.load(id)) !== null;
  }
}
