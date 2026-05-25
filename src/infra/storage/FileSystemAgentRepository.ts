import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentDTO, IAgentRepository } from '../types/agent';

/**
 * 基於檔案系統的代理儲存庫實作
 * 將代理配置以 JSON 格式儲存在指定目錄中。
 */
export class FileSystemAgentRepository implements IAgentRepository {
  /**
   * 初始化檔案系統代理儲存庫
   * @param baseDir 代理配置儲存的基礎目錄
   */
  constructor(private baseDir: string) {}

  /**
   * 確保儲存目錄存在
   */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /**
   * 根據 ID 查找代理配置
   * @param id 代理識別碼
   */
  async findById(id: string): Promise<AgentDTO | null> {
    const filePath = path.join(this.baseDir, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as AgentDTO;
    } catch (err) {
      return null;
    }
  }

  /**
   * 獲取系統中所有已註冊的代理配置
   */
  async findAll(): Promise<AgentDTO[]> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(this.baseDir);
      const agents: AgentDTO[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const data = await fs.readFile(path.join(this.baseDir, file), 'utf-8');
          agents.push(JSON.parse(data) as AgentDTO);
        } catch (err) {
          // 忽略損壞的檔案
          continue;
        }
      }
      return agents;
    } catch (err) {
      return [];
    }
  }

  /**
   * 保存或更新代理配置
   * @param agent 代理數據對象
   */
  async save(agent: AgentDTO): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.baseDir, `${agent.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(agent, null, 2), 'utf-8');
  }
}
