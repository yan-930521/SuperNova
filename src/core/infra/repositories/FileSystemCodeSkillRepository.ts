import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Config } from '../../config/Config';
import { CodeSkillEntity, ICodeSkillRepository } from '../../domain/ICodeSkillRepository';
import { IdGenerator } from '@supernova/common/IdGenerator';
import { LRUCache } from '@supernova/common/LRUCache';
import { BaseJsonRepository } from '@supernova/storage/base/BaseJsonRepository';

/**
 * 基於本地檔案系統的 CodeSkill 倉儲實作。
 * 使用 BaseJsonRepository 來管理 index 檔案，並手動處理 .ts 程式碼檔。
 */
export class FileSystemCodeSkillRepository extends BaseJsonRepository<Record<string, CodeSkillEntity>> implements ICodeSkillRepository {
    // 記憶體快取：以 `${sessionId}:${agentId}` 為 Key
    private readonly cache: LRUCache<string, Record<string, CodeSkillEntity>>;

    constructor(
        private readonly config: Config,
        baseDir: string
    ) {
        super(baseDir);
        this.cache = new LRUCache<string, Record<string, CodeSkillEntity>>(100);
    }

    protected getFilePath(sessionId: string, agentId: string): string {
        const agentDir = path.join(this.baseDir, sessionId, this.config.storage.agent_dir, agentId, this.config.storage.code_skill_dir);
        return path.join(agentDir, this.config.storage.code_skill_file);
    }

    private getCacheKey(sessionId: string, agentId: string): string {
        return `${sessionId}:${agentId}`;
    }

    private async loadIndex(sessionId: string, agentId: string): Promise<Record<string, CodeSkillEntity>> {
        const cacheKey = this.getCacheKey(sessionId, agentId);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached }; 
        }

        const data = await this.readJson(this.getFilePath(sessionId, agentId));
        const indexData = data || {};
        this.cache.set(cacheKey, indexData);
        return { ...indexData };
    }

    private async saveIndex(sessionId: string, agentId: string, indexData: Record<string, CodeSkillEntity>): Promise<void> {
        const cacheKey = this.getCacheKey(sessionId, agentId);
        this.cache.set(cacheKey, { ...indexData });
        await this.writeJson(this.getFilePath(sessionId, agentId), indexData);
    }

    public async getSkill(sessionId: string, agentId: string, skillName: string): Promise<CodeSkillEntity | null> {
        const indexData = await this.loadIndex(sessionId, agentId);
        return indexData[skillName] || null;
    }

    public async saveSkill(sessionId: string, agentId: string, skillId: string, description: string, code: string): Promise<string> {
        const newVersionId = IdGenerator.codeSkillVersion();
        const timestamp = Date.now();
        
        const indexData = await this.loadIndex(sessionId, agentId);
        let existingSkill = indexData[skillId];
        
        if (!existingSkill) {
            existingSkill = {
                id: skillId,
                description: description,
                currentVersionId: newVersionId,
                versions: {},
                timestamp: timestamp
            };
        } else {
            existingSkill = {
                ...existingSkill,
                description: description,
                currentVersionId: newVersionId
            };
        }

        existingSkill.versions[newVersionId] = {
            versionId: newVersionId,
            timestamp: timestamp,
            usageStats: {
                executionCount: 0,
                successCount: 0,
                failureCount: 0,
                successRate: 0,
                lossRate: 0,
                averageDurationMs: 0
            }
        };

        const filePath = this.getSkillFilePathByVersion(sessionId, agentId, skillId, newVersionId);
        const dir = path.dirname(filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        await fs.writeFile(filePath, code, 'utf-8');

        indexData[skillId] = existingSkill;
        await this.saveIndex(sessionId, agentId, indexData);

        return newVersionId;
    }

    public async listSkills(sessionId: string, agentId: string): Promise<CodeSkillEntity[]> {
        const indexData = await this.loadIndex(sessionId, agentId);
        return Object.values(indexData);
    }

    public async recordExecution(sessionId: string, agentId: string, skillName: string, isSuccess: boolean, durationMs: number): Promise<void> {
        const indexData = await this.loadIndex(sessionId, agentId);
        const skill = indexData[skillName];
        if (!skill) return; 

        const version = skill.versions[skill.currentVersionId];
        if (!version) return;

        const stats = version.usageStats;
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

        await this.saveIndex(sessionId, agentId, indexData);
    }

    // --- 內部輔助方法 ---
    private getDirName(sessionId: string, agentId: string): string {
        const agentDir = path.join(this.baseDir, sessionId, this.config.storage.agent_dir, agentId, this.config.storage.code_skill_dir);
        if (!existsSync(agentDir)) {
            mkdirSync(agentDir, { recursive: true });
        }
        return agentDir;
    }

    public async getSkillFilePath(sessionId: string, agentId: string, skillId: string): Promise<string> {
        const indexData = await this.loadIndex(sessionId, agentId);
        const skill = indexData[skillId];
        if (!skill) {
            throw new Error(`Skill ${skillId} not found in index.`);
        }
        return this.getSkillFilePathByVersion(sessionId, agentId, skillId, skill.currentVersionId);
    }

    private getSkillFilePathByVersion(sessionId: string, agentId: string, skillId: string, versionId: string): string {
        const targetDir = this.getDirName(sessionId, agentId);
        return path.join(targetDir, `${skillId}_${versionId}.ts`);
    }

    public async getSkillCode(sessionId: string, agentId: string, skillName: string, versionId?: string): Promise<string> {
        const indexData = await this.loadIndex(sessionId, agentId);
        const skill = indexData[skillName];
        if (!skill) throw new Error(`Skill ${skillName} not found.`);
        
        const targetVersion = versionId || skill.currentVersionId;
        if (!skill.versions[targetVersion]) throw new Error(`Version ${targetVersion} not found in skill ${skillName}.`);

        const filePath = this.getSkillFilePathByVersion(sessionId, agentId, skillName, targetVersion);
        if (!existsSync(filePath)) throw new Error(`File not found for skill ${skillName} version ${targetVersion}.`);

        return fs.readFile(filePath, 'utf-8');
    }

    public async rollbackSkill(sessionId: string, agentId: string, skillName: string, versionId?: string): Promise<void> {
        const indexData = await this.loadIndex(sessionId, agentId);
        const skill = indexData[skillName];
        if (!skill) throw new Error(`Skill ${skillName} not found.`);

        let targetVersion = versionId;
        
        if (!targetVersion) {
            let bestVersion = skill.currentVersionId;
            let bestScore = -1;

            for (const [vId, versionData] of Object.entries(skill.versions)) {
                if (vId === skill.currentVersionId) continue; 
                
                const stats = versionData.usageStats;
                const score = stats.executionCount > 0 ? stats.successRate : 0; 
                
                if (score > bestScore) {
                    bestScore = score;
                    bestVersion = vId;
                }
            }
            targetVersion = bestVersion;
        }

        if (!skill.versions[targetVersion]) {
            throw new Error(`Target version ${targetVersion} not found.`);
        }

        if (skill.currentVersionId === targetVersion) {
            throw new Error(`Already on version ${targetVersion}.`);
        }

        const updatedSkill = { ...skill, currentVersionId: targetVersion };
        indexData[skillName] = updatedSkill;
        await this.saveIndex(sessionId, agentId, indexData);
    }

    public async deleteSkill(sessionId: string, agentId: string, skillName: string): Promise<void> {
        const indexData = await this.loadIndex(sessionId, agentId);
        if (!indexData[skillName]) return;

        delete indexData[skillName];
        await this.saveIndex(sessionId, agentId, indexData);
    }

    public async deleteSkillVersion(sessionId: string, agentId: string, skillName: string, versionId: string): Promise<void> {
        const indexData = await this.loadIndex(sessionId, agentId);
        const skill = indexData[skillName];
        if (!skill) throw new Error(`Skill ${skillName} not found.`);

        if (!skill.versions[versionId]) {
            throw new Error(`Version ${versionId} not found in skill ${skillName}.`);
        }
        
        if (skill.currentVersionId === versionId) {
            throw new Error(`Cannot delete the current active version ${versionId}. Rollback first.`);
        }

        delete skill.versions[versionId];
        indexData[skillName] = skill;
        await this.saveIndex(sessionId, agentId, indexData);
    }
}
