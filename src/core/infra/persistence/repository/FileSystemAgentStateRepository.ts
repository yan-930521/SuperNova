import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IAgentStateRepository, BaseAgentData } from '../IRepository';
import { LogManager } from '../../LogManager';

/**
 * FileSystemAgentStateRepository
 * 基於本地檔案系統的 Agent 狀態快照儲存庫實現。
 * 保存於 `workspace/session/{sessionId}/agents/{agentId}/`
 */
export class FileSystemAgentStateRepository implements IAgentStateRepository {
  private readonly logger = LogManager.recorder;
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * 保存 Agent 的狀態快照資料
   */
  public async saveAgentState(
    sessionId: string,
    agentId: string,
    state: BaseAgentData,
    options?: { isClone?: boolean; parentAgentId?: string }
  ): Promise<void> {
    const parentDir = options?.isClone && options.parentAgentId ? options.parentAgentId : agentId;
    const filename = options?.isClone ? `state_${agentId}.json` : 'state.json';
    const oplogDir = path.join(this.baseDir, sessionId, 'agents', parentDir);
    const filePath = path.join(oplogDir, filename);

    try {
      if (!existsSync(oplogDir)) {
        await fs.mkdir(oplogDir, { recursive: true });
      }
      const data = JSON.stringify(state, null, 2);
      await fs.writeFile(filePath, data, 'utf-8');
      this.logger.debug(`[AgentStateRepository] State saved successfully to ${filePath}`);
    } catch (err: any) {
      this.logger.error(`[AgentStateRepository] Failed to save state to ${filePath}: ${err.message}`);
      throw err;
    }
  }

  /**
   * 讀取並還原 Agent 的狀態快照資料
   */
  public async loadAgentState(
    sessionId: string,
    agentId: string,
    options?: { isClone?: boolean; parentAgentId?: string }
  ): Promise<BaseAgentData | null> {
    const parentDir = options?.isClone && options.parentAgentId ? options.parentAgentId : agentId;
    const filename = options?.isClone ? `state_${agentId}.json` : 'state.json';
    const oplogDir = path.join(this.baseDir, sessionId, 'agents', parentDir);
    const filePath = path.join(oplogDir, filename);

    if (!existsSync(filePath)) {
      this.logger.debug(`[AgentStateRepository] State file not found: ${filePath}`);
      return null;
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as BaseAgentData;
    } catch (err: any) {
      this.logger.error(`[AgentStateRepository] Failed to load state from ${filePath}: ${err.message}`);
      throw err;
    }
  }

  // ==========================================
  // IRepository<BaseAgentData> 通用接口實現
  // ==========================================

  public async save(entity: BaseAgentData): Promise<void> {
    await this.saveAgentState(entity.sessionId, entity.id, entity, {
      isClone: entity.isClone,
      parentAgentId: entity.parentAgentId
    });
  }

  public async load(id: string): Promise<BaseAgentData | null> {
    const { sessionId, agentId, options } = this.parseCompositeId(id);
    return await this.loadAgentState(sessionId, agentId, options);
  }

  public async exists(id: string): Promise<boolean> {
    try {
      const { sessionId, agentId, options } = this.parseCompositeId(id);
      const parentDir = options?.isClone && options.parentAgentId ? options.parentAgentId : agentId;
      const filename = options?.isClone ? `state_${agentId}.json` : 'state.json';
      const filePath = path.join(this.baseDir, sessionId, 'agents', parentDir, filename);
      return existsSync(filePath);
    } catch {
      return false;
    }
  }

  public async delete(id: string): Promise<void> {
    const { sessionId, agentId, options } = this.parseCompositeId(id);
    const parentDir = options?.isClone && options.parentAgentId ? options.parentAgentId : agentId;
    const filename = options?.isClone ? `state_${agentId}.json` : 'state.json';
    const filePath = path.join(this.baseDir, sessionId, 'agents', parentDir, filename);

    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  }

  public async list(): Promise<BaseAgentData[]> {
    this.logger.warn('[AgentStateRepository] list() operation is not supported on agent state snapshots');
    return [];
  }

  /**
   * 解析複合式 ID
   * 格式:
   * 1. 獨立模式: "sessionId:agentId"
   * 2. 分身模式: "sessionId:parentAgentId:cloneId"
   */
  private parseCompositeId(id: string): {
    sessionId: string;
    agentId: string;
    options?: { isClone?: boolean; parentAgentId?: string };
  } {
    const parts = id.split(':');
    if (parts.length === 2) {
      return { sessionId: parts[0], agentId: parts[1] };
    } else if (parts.length === 3) {
      return {
        sessionId: parts[0],
        agentId: parts[2],
        options: { isClone: true, parentAgentId: parts[1] }
      };
    }
    throw new Error(`Invalid composite agent state ID: ${id}. Format must be "sessionId:agentId" or "sessionId:parentAgentId:cloneId"`);
  }
}
