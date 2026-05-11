/**
 * 系統掛鉤接口 (Hook)
 * 作為系統規則或邏輯的擴展點，允許 Mutation 進行動態變更。
 */
export interface IHook {
  /** Hook 唯一標識符 */
  id: string;
  /** Hook 名稱，與 IMutationRequest.target_hook 對應 */
  name: string;
  /** 當前 Hook 的版本標識 (用於 MVCC) */
  version: string;
}
