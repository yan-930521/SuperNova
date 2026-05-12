/**
 * 工具執行上下文接口
 * 用於在工具調用鏈中傳遞會話、代理與追蹤資訊。
 */
export interface IToolContext {
  /** 發起調用的會話 ID */
  sessionId: string;
  /** 執行工具的代理 ID */
  agentId: string;
  /** 用於全鏈路追蹤的 UUID */
  traceId: string;
}
