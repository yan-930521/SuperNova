import { AgentDTO } from '../../types/agent';
import { IAgentRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 基於檔案系統的代理儲存庫實作
 * 除了基礎 CRUD 外，支援批次載入所有代理配置。
 */
export class FileSystemAgentRepository 
  extends BaseFileSystemRepository<AgentDTO> 
  implements IAgentRepository<AgentDTO> 
{
  constructor(baseDir: string) {
    super(baseDir, 'AgentRepo');
  }

  /**
   * 獲取系統中所有已註冊的代理配置
   */
  async findAll(): Promise<AgentDTO[]> {
    try {
      const ids = await this.list();
      const agents: AgentDTO[] = [];

      for (const id of ids) {
        const agent = await this.load(id);
        if (agent) {
          agents.push(agent);
        }
      }
      return agents;
    } catch (error) {
      return [];
    }
  }
}
