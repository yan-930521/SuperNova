import * as path from 'path';

import { IPromptSection, PromptSectionIndex } from '@supernova/events/IBus';
import { DEFAULT_STORAGE_CONFIG, StorageConfig } from '../../config';
import { IAgentContext, IAgentModule, RunContext } from '../types';
import {
    AgentProfile, FileSystemProfileRepository, PromptLoader, PromptLoaderOptions, SYSTEM_PROMPTS
} from '../profile';

/**
 * Profile 模組選項
 */
export interface ProfileModuleOptions {
    /** 初始注入的 Profile 資料物件 */
    profile?: AgentProfile;
    /** 是否包含通用的系統通訊協議與工具調用提示詞 (預設 true) */
    includeSystemPrompts?: boolean;
    /** 所屬會話 ID (用於將 profile 持久化至 sessions/{sessionId}/agents/ 目錄) */
    sessionId?: string;
    /** 可選注入外部統一建立的 Profile 儲存庫實例 (單例，繼承 BaseJsonRepository) */
    repository?: FileSystemProfileRepository;
    /** 掛載或更新時是否自動將自身資料落盤至專屬目錄 (預設 true) */
    autoSave?: boolean;
}


/**
 * 代理人人設與身份認知器官模組 (ProfileModule)
 * 遵循 V2 組合式模組架構 (IAgentModule)：
 * 1. 負責將結構化的 AgentProfile 轉譯為具備標準優先級權重的 IPromptSection 區塊
 * 2. 嚴格對應 PromptSectionIndex：
 *    - IDENTITY (1)：人設身份與性格獨白
 *    - SYSTEM_CORE (2)：核心使命、絕對準則、通訊協議
 *    - TACTICAL_GUIDELINE (8)：行動方針、特殊能力、輸出格式
 *    - TOOL_USAGE (9)：工具驗證原則與資料指標處理規範
 * 3. 支援熱插拔與即時人設切換 (setProfile)
 */
export class ProfileModule implements IAgentModule {
    /** 模組識別名稱 */
    public readonly name: string = 'profile';

    /** 執行優先級：設為 5，在對話歷史 (10) 與其他器官之前優先組裝人設骨架 */
    public readonly priority: number = 5;

    private _profile?: AgentProfile;
    private readonly includeSystemPrompts: boolean;
    private readonly sessionId?: string;
    private readonly autoSave: boolean;
    private readonly repository?: FileSystemProfileRepository;
    private context?: IAgentContext;

    constructor(options: ProfileModuleOptions = {}) {
        this._profile = options.profile;
        this.includeSystemPrompts = options.includeSystemPrompts ?? true;
        this.sessionId = options.sessionId;
        this.repository = options.repository;
        this.autoSave = options.autoSave ?? true;
    }



    /**
     * 工廠方法：從 Profile 物件直接建立模組實例
     * @param profile 結構化身份設定
     * @param includeSystemPrompts 是否包含系統級通用 Prompt
     * @param options 其他模組選項
     */
    public static fromProfile(
        profile: AgentProfile,
        includeSystemPrompts: boolean = true,
        options: Omit<ProfileModuleOptions, 'profile' | 'includeSystemPrompts'> = {}
    ): ProfileModule {
        return new ProfileModule({ ...options, profile, includeSystemPrompts });
    }

    /**
     * 工廠方法：藉由 PromptLoader 自檔案系統載入特定 Profile (例如 'main_agent', 'task_agent')
     * @param profileName Profile 名稱
     * @param options 加載選項
     * @param includeSystemPrompts 是否包含系統級通用 Prompt
     * @param moduleOptions 其他模組選項
     */
    public static load(
        profileName: string,
        options: PromptLoaderOptions = {},
        includeSystemPrompts: boolean = true,
        moduleOptions: Omit<ProfileModuleOptions, 'profile' | 'includeSystemPrompts'> = {}
    ): ProfileModule {
        const loaded = PromptLoader.loadProfile(profileName, options);
        if (!loaded) {
            throw new Error(`ProfileModule: Failed to load profile [${profileName}] from disk`);
        }
        return new ProfileModule({ ...moduleOptions, profile: loaded, includeSystemPrompts });
    }

    /**
     * 當模組掛載至 Agent 容器時觸發
     * @param context 代理人上下文
     */
    public async onAttach(context: IAgentContext): Promise<void> {
        this.context = context;
        // 若 Profile 中有建議的 llmPreset，自動調整宿主 Agent 的推論 preset
        if (this._profile?.llmPreset && typeof context.setPresetName === 'function') {
            context.setPresetName(this._profile.llmPreset);
        }

        // 自動將自身資料落盤至專屬目錄 (sessions/{sessionId}/agents/{agentId}/profile.json)
        if (this.autoSave && this._profile) {
            try {
                await this.saveProfile();
            } catch {
                // 落盤失敗視為非致命錯誤，不中斷掛載流程
            }
        }
    }

    /**
     * 當模組從 Agent 卸載時觸發
     */
    public onDetach(): void {
        this.context = undefined;
    }

    /**
     * 取得當前人設 Profile
     */
    public get profile(): AgentProfile | undefined {
        return this._profile;
    }

    /**
     * 取得 Profile 中建議的 LLM Preset 名稱
     */
    public get llmPreset(): string | undefined {
        return this._profile?.llmPreset;
    }

    /**
     * 動態替換或覆寫人設 (若新 Profile 含有 llmPreset 則同步更新 Agent，並自動持久化)
     * @param newProfile 新人設資料
     */
    public async setProfile(newProfile: AgentProfile): Promise<void> {
        this._profile = newProfile;
        if (newProfile.llmPreset && this.context && typeof this.context.setPresetName === 'function') {
            this.context.setPresetName(newProfile.llmPreset);
        }

        if (this.autoSave) {
            try {
                await this.saveProfile();
            } catch {
                // 非致命錯誤忽略
            }
        }
    }

    /**
     * 取得或初始化 Profile 專屬儲存庫 (BaseJsonRepository)
     */
    /**
     * 取得已注入之 Profile 儲存庫實例
     */
    public getProfileRepository(): FileSystemProfileRepository | undefined {
        return this.repository;
    }

    /**
     * 將自身 Profile 資料持久化落盤至專屬目錄 (sessions/{sessionId}/agents/{agentId}/profile.json)
     * 透過繼承 BaseJsonRepository 的外部單例 FileSystemProfileRepository 執行安全寫入
     * @param customPath 自訂存檔路徑 (可選)
     * @returns 實際存檔之絕對或相對檔案路徑 (若未注入 repository 則返回空字串)
     */
    public async saveProfile(customPath?: string): Promise<string> {
        if (!this._profile) {
            throw new Error('ProfileModule: Cannot save empty profile');
        }

        if (!this.repository) {
            return '';
        }

        if (customPath) {
            const resolvedPath = path.resolve(customPath);
            await this.repository['writeJson'](resolvedPath, this._profile);
            return resolvedPath;
        }

        const agentId = this.context?.agentId ?? 'default_agent';
        const sessionId = this.sessionId ?? this.context?.sessionId;
        return await this.repository.save(agentId, this._profile, sessionId);
    }




    /**
     * 將 Profile 渲染組裝為順序排列的 PromptSection 陣列
     */
    public getPromptSections(): IPromptSection[] {
        const sections: IPromptSection[] = [];
        const profile = this._profile;

        if (!profile) {
            return sections;
        }

        // ─── 1. PromptSectionIndex.IDENTITY (1) ───
        if (profile.identity) {
            sections.push({
                index: PromptSectionIndex.IDENTITY,
                content: profile.identity.trim(),
            });
        }

        // ─── 2. PromptSectionIndex.SYSTEM_CORE (2) ───
        const coreLines: string[] = [];
        if (this.includeSystemPrompts) {
            coreLines.push(SYSTEM_PROMPTS.COMMUNICATION_PROTOCOL);
            coreLines.push(SYSTEM_PROMPTS.NETWORK_COMMUNICATION);
        }
        if (profile.mission) {
            coreLines.push(`【核心使命 (Mission)】\n${profile.mission.trim()}`);
        }
        if (Array.isArray(profile.principles) && profile.principles.length > 0) {
            const principlesText = profile.principles.map((p) => `- ${p}`).join('\n');
            coreLines.push(`【行為準則與底線 (Principles)】\n${principlesText}`);
        }
        const coreContent = coreLines.join('\n\n').trim();
        if (coreContent) {
            sections.push({
                index: PromptSectionIndex.SYSTEM_CORE,
                content: coreContent,
            });
        }

        // ─── 3. PromptSectionIndex.TACTICAL_GUIDELINE (8) ───
        const tacticalLines: string[] = [];
        if (Array.isArray(profile.capabilities) && profile.capabilities.length > 0) {
            const capText = profile.capabilities.map((c) => `- ${c}`).join('\n');
            tacticalLines.push(`【特殊能力與權限 (Capabilities)】\n${capText}`);
        }
        if (Array.isArray(profile.action_guidelines) && profile.action_guidelines.length > 0) {
            const guideText = profile.action_guidelines.map((g) => `- ${g}`).join('\n');
            tacticalLines.push(`【行動方針 (Action Guidelines)】\n${guideText}`);
        }
        if (profile.outputFormat) {
            tacticalLines.push(`【輸出格式限制 (Output Format)】\n${profile.outputFormat.trim()}`);
        }
        const tacticalContent = tacticalLines.join('\n\n').trim();
        if (tacticalContent) {
            sections.push({
                index: PromptSectionIndex.TACTICAL_GUIDELINE,
                content: tacticalContent,
            });
        }

        // ─── 4. PromptSectionIndex.TOOL_USAGE (9) ───
        if (this.includeSystemPrompts) {
            const toolUsageLines = [
                SYSTEM_PROMPTS.TOOL_USAGE_AND_VERIFICATION,
                SYSTEM_PROMPTS.DATA_POINTER_HANDLING,
            ];
            sections.push({
                index: PromptSectionIndex.TOOL_USAGE,
                content: toolUsageLines.join('\n\n').trim(),
            });
        }

        return sections;
    }
}
