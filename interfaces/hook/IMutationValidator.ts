import type { IHook } from './IHook';
import type { MutationRequest } from '../../src/models/MutationRequest';

/**
 * 變更校驗器接口
 * 負責在 Mutation 執行前進行靜態規範校驗與動態版本衝突檢測。
 */
export interface IMutationValidator {
  /** 
   * 靜態語法與權限校驗 
   * @param request 變更請求對象
   */
  validateStatic(request: MutationRequest): boolean;

  /** 
   * 動態版本與狀態衝突校驗 (MVCC)
   * 確保變更基於正確的目標版本。
   * @param request 變更請求對象
   * @param current_hook 當前 Hook 的實例 or 狀態
   */
  validateVersion(request: MutationRequest, current_hook: IHook): boolean;
}
