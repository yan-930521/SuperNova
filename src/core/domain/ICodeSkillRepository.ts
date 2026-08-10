import { IEntity, IRepository } from './IRepository';

export interface CodeSkillUsageStats {
    executionCount: number;
    successCount: number;
    failureCount: number;
    successRate: number;      // 0.0 ~ 1.0
    lossRate: number;         // 0.0 ~ 1.0 
    averageDurationMs: number;
}

export interface CodeSkillVersion {
    versionId: string;
    timestamp: number;
    usageStats: CodeSkillUsageStats;
}

export interface CodeSkillEntity extends IEntity {
    readonly id: string; // The name of the skill, e.g., 'GatherWoodSkill'
    readonly description: string;
    readonly currentVersionId: string;
    readonly versions: Record<string, CodeSkillVersion>;
    readonly timestamp: number;
}

export interface ICodeSkillRepository extends IRepository<CodeSkillEntity> {
    /**
     * 取得指定技能的詮釋資料與統計
     */
    getSkill(sessionId: string, agentId: string, skillName: string): Promise<CodeSkillEntity | null>;

    /**
     * 儲存技能的詮釋資料，並同步寫入 TypeScript 原始碼至工作區。
     * 自動產生新的版號 (versionId) 並回傳。
     */
    saveSkill(sessionId: string, agentId: string, skillId: string, description: string, code: string): Promise<string>;

    /**
     * 列出該工作區內所有已註冊的技能
     */
    listSkills(sessionId: string, agentId: string): Promise<CodeSkillEntity[]>;

    /**
     * 紀錄技能的執行結果，並自動重新計算成功率、損耗率等分析數據
     */
    recordExecution(sessionId: string, agentId: string, skillName: string, isSuccess: boolean, durationMs: number): Promise<void>;

    /**
     * 取得技能腳本的絕對路徑，供動態載入使用
     */
    getSkillFilePath(sessionId: string, agentId: string, skillName: string): Promise<string>;

    /**
     * 讀取指定技能的原始碼
     */
    getSkillCode(sessionId: string, agentId: string, skillName: string, versionId?: string): Promise<string>;

    /**
     * 退回技能至指定版本 (若未指定，則退回至成功率最高的版本)
     */
    rollbackSkill(sessionId: string, agentId: string, skillName: string, versionId?: string): Promise<void>;

    /**
     * 刪除指定技能
     */
    deleteSkill(sessionId: string, agentId: string, skillName: string): Promise<void>;

    /**
     * 刪除指定技能的特定版本
     */
    deleteSkillVersion(sessionId: string, agentId: string, skillName: string, versionId: string): Promise<void>;
}
