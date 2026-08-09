import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Config } from '../../config/Config';
import { CodeSkillEntity, ICodeSkillRepository } from '../../domain/ICodeSkillRepository';
import { LRUCache } from '../../utils/LRUCache';
import { LogManager } from '../LogManager';

import { IdGenerator } from '../../utils/IdGenerator';

/**
 * 基於本地檔案系統的 CodeSkill 倉儲實作。
 * 支援 LRU 快取，檔案存放在 `workspace/session/{sessionId}/agents/{agentId}/skills` 
 */
export class FileSystemCodeSkillRepository implements ICodeSkillRepository {
    private readonly logger = LogManager.recorder;

    // 記憶體快取：以 `${sessionId}:${agentId}` 為 Key
    private readonly cache: LRUCache<string, Record<string, CodeSkillEntity>>;

    constructor(
        private readonly config: Config,
        private readonly baseDir: string
    ) {
        this.cache = new LRUCache<string, Record<string, CodeSkillEntity>>(100);
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
            const indexFile = this.getIndexFileName(sessionId, agentId);
            if (!existsSync(indexFile)) return {};

            const rawIndex = await fs.readFile(indexFile, 'utf-8');
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

        const indexFile = this.getIndexFileName(sessionId, agentId);
        await fs.writeFile(indexFile, JSON.stringify(indexData, null, 2), 'utf-8');
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
        // 通常放在 workspace/session/{sessionId}/agents/{agentId}/skills
        const targetId = agentId;
        const agentDir = path.join(this.baseDir, sessionId, this.config.storage.agent_dir, targetId, this.config.storage.code_skill_dir);
        if (!existsSync(agentDir)) {
            mkdirSync(agentDir, { recursive: true });
        }
        return agentDir;
    }

    private getIndexFileName(sessionId: string, agentId: string): string {
        const targetDir = this.getDirName(sessionId, agentId);
        return path.join(targetDir, this.config.storage.code_skill_file);
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
        
        // If no version specified, find the one with the highest success rate
        if (!targetVersion) {
            let bestVersion = skill.currentVersionId;
            let bestScore = -1;

            for (const [vId, versionData] of Object.entries(skill.versions)) {
                if (vId === skill.currentVersionId) continue; // Skip current version
                
                const stats = versionData.usageStats;
                // Score = successRate, with a penalty for low execution count to prefer proven versions
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
        // We do not delete the physical files here, they act as historical backups
    }
}
