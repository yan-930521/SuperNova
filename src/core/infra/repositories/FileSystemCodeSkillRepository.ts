import * as path from 'path';
import { IWorkspaceManager } from '../../domain/IWorkspaceManager';
import { CodeSkillEntity, ICodeSkillRepository } from '../../domain/ICodeSkillRepository';
import { LRUCache } from '../../utils/LRUCache';

/**
 * 透過 WorkspaceManager 管理 CodeSkill 的倉儲實作。
 * 支援 LRU 快取，並允許自訂儲存目錄 (不硬編碼)。
 */
export class FileSystemCodeSkillRepository implements ICodeSkillRepository {
    // 記憶體快取：以 `${sessionId}:${agentId}` 為 Key
    private readonly cache: LRUCache<string, Record<string, CodeSkillEntity>>;

    constructor(
        private workspaceManager: IWorkspaceManager,
        private skillsDir: string = 'skills'
    ) { 
        this.cache = new LRUCache<string, Record<string, CodeSkillEntity>>(100);
    }

    private getIndexFileName(): string {
        return path.posix.join(this.skillsDir, 'skills_index.json');
    }

    private getCacheKey(sessionId: string, agentId: string): string {
        return `${sessionId}:${agentId}`;
    }

    private async loadIndex(sessionId: string, agentId: string): Promise<Record<string, CodeSkillEntity>> {
        const cacheKey = this.getCacheKey(sessionId, agentId);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached }; // 回傳拷貝，避免參照污染
        }

        try {
            const rawIndex = await this.workspaceManager.readFile(sessionId, agentId, this.getIndexFileName());
            const data = JSON.parse(rawIndex);
            this.cache.set(cacheKey, data);
            return { ...data };
        } catch (e) {
            return {};
        }
    }

    private async saveIndex(sessionId: string, agentId: string, indexData: Record<string, CodeSkillEntity>): Promise<void> {
        const cacheKey = this.getCacheKey(sessionId, agentId);
        this.cache.set(cacheKey, { ...indexData });
        await this.workspaceManager.writeFile(sessionId, agentId, this.getIndexFileName(), JSON.stringify(indexData, null, 2));
    }

    public async getSkill(sessionId: string, agentId: string, skillName: string): Promise<CodeSkillEntity | null> {
        const indexData = await this.loadIndex(sessionId, agentId);
        return indexData[skillName] || null;
    }

    public async saveSkill(sessionId: string, agentId: string, skill: CodeSkillEntity, code: string): Promise<void> {
        // 1. 寫入 TypeScript 執行檔
        const filePath = path.posix.join(this.skillsDir, `${skill.id}.ts`);
        await this.workspaceManager.writeFile(sessionId, agentId, filePath, code);
        
        // 2. 寫入 JSON 資源索引
        const indexData = await this.loadIndex(sessionId, agentId);
        indexData[skill.id] = skill;
        await this.saveIndex(sessionId, agentId, indexData);
    }

    public async listSkills(sessionId: string, agentId: string): Promise<CodeSkillEntity[]> {
        const indexData = await this.loadIndex(sessionId, agentId);
        return Object.values(indexData);
    }

    public async recordExecution(sessionId: string, agentId: string, skillName: string, isSuccess: boolean, durationMs: number): Promise<void> {
        const indexData = await this.loadIndex(sessionId, agentId);
        const skill = indexData[skillName];
        if (!skill) return; // 若無該技能紀錄則忽略

        const stats = skill.usageStats;
        const totalTime = stats.averageDurationMs * stats.executionCount;

        stats.executionCount += 1;
        if (isSuccess) {
            stats.successCount += 1;
        } else {
            stats.failureCount += 1;
        }

        stats.successRate = stats.successCount / stats.executionCount;
        stats.lossRate = stats.failureCount / stats.executionCount;
        stats.averageDurationMs = (totalTime + durationMs) / stats.executionCount;
        
        const updatedSkill = { ...skill, usageStats: stats, timestamp: Date.now() };
        indexData[skillName] = updatedSkill;

        await this.saveIndex(sessionId, agentId, indexData);
    }
}
