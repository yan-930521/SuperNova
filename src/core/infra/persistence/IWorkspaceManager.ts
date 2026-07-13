export type WorkspaceType = 'VOLATILE' | 'PERSISTENT';

/**
 * 工作區與版本控制管理器介面 (WorkspaceManager)
 * 負責為每個 Agent 或 Task 建立專屬目錄。
 * 支援「分級工作區 (Tiered Workspace)」架構，整合虛擬檔案系統 (VFS) 與實體 Git 追蹤，以解決高併發下的 I/O 瓶頸。
 */
export interface IWorkspaceManager {
  /**
   * 初始化一個全新或已存在的工作區
   * @param id Agent ID 或 Task ID
   * @param type 工作區類型。預設為 VOLATILE (記憶體虛擬檔案系統)，以極速處理無狀態任務。若需修改專案原始碼，需明確指定為 PERSISTENT (實體 Git 分支)。
   * @returns 該專屬工作區的絕對路徑 (VFS 路徑或實體路徑)
   */
  initWorkspace(id: string, type?: WorkspaceType): Promise<string>;

  /**
   * 提交工作區內的變更至版本控制 (Commit)
   * 這為 Oplog 回滾提供了實體檔案層級的依據
   * @param id Agent ID 或 Task ID
   * @param message Commit 訊息
   */
  commitChanges(id: string, message: string): Promise<void>;

  /**
   * 將分支變更合併回主分支 (Merge)
   * 適用於 Task 狀態為 SUCCESS 時，系統會先進行 Dry-Run 與基礎 CI 測試。
   * 若發生 Git 衝突或 CI 失敗，不自行修復，而是回傳錯誤細節，交由上層 Agent 作為任務 (Task) 處理。
   * @param id Agent ID 或 Task ID
   */
  mergeWorkspace(id: string): Promise<{ success: boolean; conflictDetails?: string; ciLogs?: string }>;

  /**
   * 銷毀並清理工作區 (GC)
   * 適用於暫時型 SubAgent 完成任務後
   * @param id Agent ID 或 Task ID
   */
  destroyWorkspace(id: string): Promise<void>;
}
