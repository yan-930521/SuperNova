import { IEntity } from './IRepository';

export interface CodeSkillUsageStats {
    executionCount: number;
    successCount: number;
    failureCount: number;
    successRate: number;      // 0.0 ~ 1.0
    lossRate: number;         // 0.0 ~ 1.0 
    averageDurationMs: number;
}

export interface CodeSkillEntity extends IEntity {
    readonly id: string; // The name of the skill, e.g., 'GatherWoodSkill'
    readonly description: string;
    readonly usageStats: CodeSkillUsageStats;
    readonly timestamp: number;
}

export interface ICodeSkillRepository {
    /**
     * 取得指定技能的詮釋資料與統計
     */
    getSkill(sessionId: string, agentId: string, skillName: string): Promise<CodeSkillEntity | null>;

    /**
     * 儲存技能的詮釋資料，並同步寫入 TypeScript 原始碼至工作區
     */
    saveSkill(sessionId: string, agentId: string, skill: CodeSkillEntity, code: string): Promise<void>;

    /**
     * 列出該工作區內所有已註冊的技能
     */
    listSkills(sessionId: string, agentId: string): Promise<CodeSkillEntity[]>;

    /**
     * 紀錄技能的執行結果，並自動重新計算成功率、損耗率等分析數據
     */
    recordExecution(sessionId: string, agentId: string, skillName: string, isSuccess: boolean, durationMs: number): Promise<void>;
}
