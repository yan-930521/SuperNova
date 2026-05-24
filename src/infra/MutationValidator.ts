import { MutationRequest } from '../models/MutationRequest';
import { IHook } from './HookRegistry';

/**
 * 變更校驗器接口
 * 負責在 Mutation 執行前進行靜態規範校驗與動態版本衝突檢測。
 */
export interface IMutationValidator {
  /** 
   * 靜態校驗 
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

/**
 * 變更校驗器實作
 */
export class MutationValidator implements IMutationValidator {
  /**
   * 靜態校驗
   * 目前實作：檢查必要的欄位是否存在，以及 priority 是否合法。
   */
  validateStatic(request: MutationRequest): boolean {
    if (!request.target_hook || !request.mutation_type) {
      return false;
    }

    if (request.priority < 0 || request.priority > 10) {
      return false;
    }

    return true;
  }

  /**
   * 動態版本校驗 (MVCC)
   * 確保變更基於的目標版本與系統當前版本一致。
   */
  validateVersion(request: MutationRequest, current_hook: IHook): boolean {
    // 如果請求中帶有預期版本，則進行強校驗
    if (request.metadata && request.metadata.base_version) {
      return request.metadata.base_version === current_hook.version;
    }

    // 預設情況下，如果沒有指定 base_version，則視為允許 (或可根據策略調整為不允許)
    return true;
  }
}
