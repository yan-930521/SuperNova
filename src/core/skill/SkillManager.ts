import { ICodeSkillRepository } from '../domain/ICodeSkillRepository';
import { LogManager } from '../infra/LogManager';
import { LRUCache } from '../utils/LRUCache';
import { BaseSkill, CodeSkillContext, ObservationSkill } from './BaseSkill';

export class SkillManager {
    private skillCache: LRUCache<string, BaseSkill<any>>;
    private logger = LogManager.recorder;

    constructor(
        private codeSkillRepo: ICodeSkillRepository,
        private getCodeSkillContext: (agentId: string) => CodeSkillContext
    ) {
        this.skillCache = new LRUCache<string, BaseSkill<any>>(100, undefined, (key, skill) => {
            if (skill instanceof ObservationSkill) {
                skill.stopSensoryLoop();
                this.logger.info(`[SkillManager] Background skill evicted and stopped: ${key}`);
            }
        });
    }

    /**
     * 取得或載入並實例化 Skill
     */
    public async getOrLoadSkill(sessionId: string, agentId: string, skillId: string): Promise<BaseSkill<any>> {
        let skill = this.skillCache.get(skillId);
        if (!skill) {
            const filePath = await this.codeSkillRepo.getSkillFilePath(sessionId, agentId, skillId);
            const module = await import(`${filePath}?t=${Date.now()}`);
            const SkillClass = module.default;
            if (!SkillClass) throw new Error(`Skill ${skillId} has no default export class`);
            
            const skillContext = this.getCodeSkillContext(agentId);
            skill = new SkillClass(skillContext);
            this.skillCache.set(skillId, skill!);
        }
        return skill!;
    }

    /**
     * 執行指定的 Skill，並記錄統計資訊
     */
    public async executeSkill(sessionId: string, agentId: string, skillId: string, args?: any): Promise<any> {
        const startTime = Date.now();
        let isSuccess = false;
        try {
            const skill = await this.getOrLoadSkill(sessionId, agentId, skillId);
            const result = await skill.execute(args);
            isSuccess = true;
            return result;
        } catch (error: any) {
            this.logger.error(`[SkillManager] Error executing skill ${skillId}: ${error.message}`);
            throw error;
        } finally {
            try {
                await this.codeSkillRepo.recordExecution(sessionId, agentId, skillId, isSuccess, Date.now() - startTime);
            } catch (e) {
                // Ignore tracking failures
            }
        }
    }

    /**
     * Scan and start all ObservationSkills owned by the specified Agent
     */
    public async startObservationSkills(sessionId: string, agentId: string, intervalMs: number = 5000): Promise<void> {
        this.logger.info(`[SkillManager] Loading and starting all background ObservationSkills for Agent ${agentId}...`);
        const skills = await this.codeSkillRepo.listSkills(sessionId, agentId);

        for (const skillMeta of skills) {
            try {
                const skill = await this.getOrLoadSkill(sessionId, agentId, skillMeta.id);
                if (skill instanceof ObservationSkill) {
                    skill.startSensoryLoop(intervalMs);
                    this.logger.info(`[SkillManager] Successfully started background skill: ${skillMeta.id}`);
                }
            } catch (err: any) {
                this.logger.warn(`[SkillManager] Failed to load background skill ${skillMeta.id}: ${err.message}`);
            }
        }
    }

    /**
     * Stop all running background skills
     */
    public stopAll(): void {
        this.logger.info(`[SkillManager] Stopping all background skills...`);
        this.skillCache.clear(); // This will trigger onEvict for all ObservationSkills
    }
}
