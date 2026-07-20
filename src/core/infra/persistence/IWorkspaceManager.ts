import { BaseTool } from '../../agent/tool/BaseTool';

export type WorkspaceType = 'VOLATILE' | 'PERSISTENT';

/**
 * 工作區與版本控制管理器介面 (WorkspaceManager)
 * 負責為每個 Session 建立、管理隔離的雙層工作區。
 */
export interface IWorkspaceManager {
  /**
   * 初始化工作區
   * @param sessionId 會話 ID (Session 中央倉庫)
   * @param agentId 代理/任務 ID (若為 Session 根倉庫，可與 sessionId 相同或省略)
   * @param type 工作區類型
   * @returns 該專屬工作區的絕對路徑
   */
  initWorkspace(sessionId: string, agentId?: string, type?: WorkspaceType): Promise<string>;

  /**
   * 檢查該 Session 的工作空間是否存在且完整
   * @param sessionId 會話 ID
   * @param type 工作區類型
   */
  hasWorkspace(sessionId: string, type: WorkspaceType): Promise<boolean>;

  /**
   * 提交工作區內的變更至版本控制 (Commit)
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param message Commit 訊息
   */
  commitChanges(sessionId: string, agentId: string, message: string): Promise<void>;

  /**
   * 將分支變更合併回主分支 (Merge)
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   */
  mergeWorkspace(sessionId: string, agentId: string): Promise<{ success: boolean; conflictDetails?: string; ciLogs?: string }>;

  /**
   * 銷毀並清理工作區
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   */
  destroyWorkspace(sessionId: string, agentId: string): Promise<void>;

  /**
   * 讀取工作區內的檔案 (安全限幅在相對路徑內)
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param relativePath 相對工作區的相對路徑
   */
  readFile(sessionId: string, agentId: string, relativePath: string): Promise<string>;

  /**
   * 寫入/修改工作區內的檔案
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param relativePath 相對工作區的相對路徑
   * @param content 寫入的內容
   */
  writeFile(sessionId: string, agentId: string, relativePath: string, content: string): Promise<void>;

  /**
   * 列出工作區內特定目錄的檔案
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param relativePath 相對目錄路徑
   */
  listFiles(sessionId: string, agentId: string, relativePath?: string): Promise<string[]>;

  /**
   * 在工作區的上下文環境下執行 Bash 命令
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   * @param command 執行的指令
   * @param options 執行參數
   */
  runBash(
    sessionId: string,
    agentId: string,
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  /**
   * (Capability Provider) 根據當前工作區狀態與代理權限，動態返回可用工具集
   * @param sessionId 會話 ID
   * @param agentId 代理/任務 ID
   */
  loadTools(sessionId: string, agentId: string): BaseTool[];
}


