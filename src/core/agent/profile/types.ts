/**
 * 代理人結構化身份與認知設定檔 (AgentProfile)
 * 相容於 workspace/profiles/*.json 規格
 */
export interface AgentProfile {
    /** Agent 的專屬姓名或代號 */
    name?: string;
    /** Agent 的基本身分與性格描述 */
    identity?: string;
    /** 核心任務目標與存在意義 */
    mission?: string;
    /** 行事準則與絕對底線列表 */
    principles?: string[];
    /** 具備的能力說明列表 */
    capabilities?: string[];
    /** 特殊的行動綱領與行為規則 */
    action_guidelines?: string[];
    /** 輸出格式要求 (例如限制字數、回覆語氣等) */
    outputFormat?: string;
    /** 建議預設使用的 LLM Preset 名稱 (例如 'REASONING_FAST') */
    llmPreset?: string;
    /** 其他擴充屬性 */
    [key: string]: any;
}
