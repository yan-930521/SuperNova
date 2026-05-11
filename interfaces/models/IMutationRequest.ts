/**
 * 修改請求接口 (Mutation Request)
 * 描述 Agent 提出的系統規則修改建議。
 */
export interface IMutationRequest<T = any> {
  /** 提出修改的 Agent ID */
  requester_id: string;
  /** 打算修改的 Hook 名稱 */
  target_hook: string;
  /** 提議變更的數據載體 */
  proposed_change: T;
  /** 優先級 (1-100) */
  priority: number;
  /** 版本參考標識 (MVCC) */
  version_ref: string;
}
