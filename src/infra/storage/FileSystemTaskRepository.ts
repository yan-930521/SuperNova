import * as fs from 'fs/promises';
import * as path from 'path';

import { MessageDTO } from '../types/session';
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
  private async ensureTaskDir(chainId: string, taskId: string): Promise<string> {
    const taskDir = path.join(this.baseDir, chainId, taskId);
    await fs.mkdir(taskDir, { recursive: true });
    return taskDir;
  }

  /**
   * 保存或更新任務元數據 (data.json)
   */
  async save(task: TaskDTO): Promise<void> {
    if (!task.chainId) {
        throw new Error(`Task ${task.id} is missing chainId, cannot save.`);
    }
    const taskDir = await this.ensureTaskDir(task.chainId, task.id);
    const dataPath = path.join(taskDir, 'data.json');

    // 分離數據，只存元數據到 data.json
    const { history, ...metadata } = task;
    await fs.writeFile(dataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // 如果 history 有內容且 history.jsonl 不存在，則初始化它
    const historyPath = path.join(taskDir, 'history.jsonl');
    try {
      await fs.access(historyPath);
    } catch {
      if (history && history.length > 0) {
        const jsonl = history.map(h => JSON.stringify(h)).join('\n') + '\n';
        await fs.writeFile(historyPath, jsonl, 'utf-8');
      }
    }
  }

  /**
   * 獲取指定會話下的所有任務
   * @param sessionId 會話識別碼
   */
  async findBySession(sessionId: string): Promise<TaskDTO[]> {
      // 由於結構改變為 <chainId>/<taskId>/data.json，findBySession 需要掃描所有子目錄
      const tasks: TaskDTO[] = [];
      try {
          await fs.mkdir(this.baseDir, { recursive: true });
          const chainDirs = await fs.readdir(this.baseDir);
          
          for (const chainDir of chainDirs) {
              const chainPath = path.join(this.baseDir, chainDir);
              const stat = await fs.stat(chainPath);
              if (!stat.isDirectory()) continue;
              
              const taskDirs = await fs.readdir(chainPath);
              for (const taskDir of taskDirs) {
                  const taskPath = path.join(chainPath, taskDir);
                  const taskStat = await fs.stat(taskPath);
                  if (!taskStat.isDirectory()) continue;
                  
                  const dataPath = path.join(taskPath, 'data.json');
                  try {
                      const data = await fs.readFile(dataPath, 'utf-8');
                      const task = JSON.parse(data) as TaskDTO;
                      if (task.sessionId === sessionId) {
                          tasks.push(await this.loadTaskWithHistory(task, taskPath));
                      }
                  } catch (err) {
                      // 忽略損壞的檔案
                      continue;
                  }
              }
          }
      } catch (err) {
          // 目錄不存在或其他錯誤
      }
      return tasks;
  }

  /**
   * 輔助方法：加載任務的歷史紀錄
   */
  private async loadTaskWithHistory(task: TaskDTO, taskDir: string): Promise<TaskDTO> {
      const historyPath = path.join(taskDir, 'history.jsonl');
      try {
        const rawHistory = await fs.readFile(historyPath, 'utf-8');
        task.history = rawHistory
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch (e) {
              return null;
            }
          })
          .filter(item => item !== null);
      } catch {
        task.history = [];
      }
      return task;
  }

  /**
   * 根據 ID 查找單一任務
   * @param id 任務識別碼
   */
  async findById(id: string): Promise<TaskDTO | null> {
      // 由於沒有傳入 chainId，我們需要掃描所有 chainId 目錄尋找指定的 taskId
      try {
          await fs.mkdir(this.baseDir, { recursive: true });
          const chainDirs = await fs.readdir(this.baseDir);
          
          for (const chainDir of chainDirs) {
              const chainPath = path.join(this.baseDir, chainDir);
              const stat = await fs.stat(chainPath);
              if (!stat.isDirectory()) continue;
              
              const taskDirPath = path.join(chainPath, id);
              try {
                  const taskStat = await fs.stat(taskDirPath);
                  if (taskStat.isDirectory()) {
                      const dataPath = path.join(taskDirPath, 'data.json');
                      const data = await fs.readFile(dataPath, 'utf-8');
                      const task = JSON.parse(data) as TaskDTO;
                      return await this.loadTaskWithHistory(task, taskDirPath);
                  }
              } catch (err) {
                  // 該目錄不存在，繼續找下一個 chainDir
                  continue;
              }
          }
      } catch (err) {
          //
      }
      return null;
  }
}
