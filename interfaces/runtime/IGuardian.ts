/**
 * 穩定性守護接口 (Stability Guardian)
 * 提供執行環境的隔離與錯誤恢復策略裁決，確保系統魯棒性。
 */
export interface IGuardian {
  /** 
   * 在防護模式下執行異步任務
   * 提供 Timeout 限制與 Exception 隔離，防止單個任務崩潰影響核心。
   * @param task 待執行的異步閉包
   * @param timeout 超時時間 (毫秒)
   */
  protect<T>(task: () => Promise<T>, timeout: number): Promise<T>;
  
  /** 
   * 錯誤恢復策略裁決
   * 根據錯誤類型決定後續處理路徑。
   * @param error 捕獲到的錯誤對象
   */
  resolveStrategy(error: Error): 'RETRY' | 'ABORT' | 'IGNORE';
}
