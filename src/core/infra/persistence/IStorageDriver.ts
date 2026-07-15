import { WorkspaceType } from './IWorkspaceManager';

/**
 * 儲存驅動者介面 (IStorageDriver)
 * 負責底層物理與虛擬 I/O 以及命令執行。
 * 解耦工作空間控制面與底層儲存。
 */
export interface IStorageDriver {
  /**
   * 初始化儲存介質
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param type 類型
   * @returns 該儲存路徑的絕對路徑
   */
  init(sessionId: string, agentId: string, type: WorkspaceType): Promise<string>;

  /**
   * 寫入檔案
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param relativePath 相對路徑
   * @param content 檔案內容
   */
  writeFile(sessionId: string, agentId: string, relativePath: string, content: string): Promise<void>;

  /**
   * 讀取檔案
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param relativePath 相對路徑
   */
  readFile(sessionId: string, agentId: string, relativePath: string): Promise<string>;

  /**
   * 列出目錄下所有檔案
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param relativePath 相對路徑
   */
  listFiles(sessionId: string, agentId: string, relativePath?: string): Promise<string[]>;

  /**
   * 在特定工作區環境下執行指令
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param command 執行的指令
   * @param options 執行參數
   */
  executeCommand(
    sessionId: string,
    agentId: string,
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  /**
   * 提交變更
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param message Commit 訊息
   */
  commit(sessionId: string, agentId: string, message: string): Promise<void>;

  /**
   * 合併變更
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   */
  merge(sessionId: string, agentId: string): Promise<{ success: boolean; conflictDetails?: string }>;

  /**
   * 銷毀並清理儲存空間
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   */
  destroy(sessionId: string, agentId: string): Promise<void>;
}
