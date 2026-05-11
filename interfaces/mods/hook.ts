import { IMutationRequest } from './models';

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

/**
 * 變更校驗器接口
 * 負責在 Mutation 執行前進行靜態規範校驗與動態版本衝突檢測。
 */
export interface IMutationValidator {
  /** 
   * 靜態語法與權限校驗 
   * @param request 變更請求對象
   */
  validateStatic(request: IMutationRequest): boolean;

  /** 
   * 動態版本與狀態衝突校驗 (MVCC)
   * 確保變更基於正確的目標版本。
   * @param request 變更請求對象
   * @param current_hook 當前 Hook 的實例或狀態
   */
  validateVersion(request: IMutationRequest, current_hook: IHook): boolean;
}
