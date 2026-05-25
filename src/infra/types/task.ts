/**
 * 任務數據傳輸對象 (Task Data Transfer Object)
 * 代表執行層中的單一任務節點，包含目標、依賴關係、執行狀態與結果。
 * 對齊 src/task/types.ts 中的 TaskNode 定義。
 */
export interface TaskDTO {
  /** 任務唯一識別碼 */
  id: string;
  /** 所屬的會話 ID */
  sessionId: string;
  /** 任務類型，如 'work', 'research', 'code' 等 */
  type: string;
  /** 任務具體要達成的目標 */
  goal: string;
  /** 執行狀態 */
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  /** 依賴的前置任務 ID 列表 */
  dependencies: string[];
  /** 被指派執行此任務的代理 ID */
  assignedAgentId?: string | null;
  /** 執行此任務所需的能力標籤 */
  requiredCapabilities?: string[];
  /** 工具路由配置：限制或偏好使用的工具集 */
  toolRouting?: {
    /** 優先使用的工具名稱列表 */
    preferredTools?: string[];
    /** 嚴禁使用的工具名稱列表 (基於安全考量) */
    forbiddenTools?: string[];
  };
  /** 執行選項與策略 */
  options?: {
    /** 執行超時限制 (毫秒) */
    timeout?: number;
    /** 失敗後的最大重試次數 */
    maxRetries?: number;
    /** 是否為關鍵任務 (若失敗則終止整個鏈) */
    isCritical?: boolean;
  };
  /** 執行產出的結果數據 */
  result?: any;
  /** 任務相關的額外元數據 */
  metadata?: Record<string, any>;
}

/**
 * 任務儲存庫接口
 * 負責 TaskDTO 的持久化，確保任務鏈在系統重啟後可恢復。
 */
export interface ITaskRepository {
  /**
   * 保存或更新任務狀態
   * @param task 任務數據對象
   */
  save(task: TaskDTO): Promise<void>;

  /**
   * 獲取指定會話下的所有任務
   * @param sessionId 會話識別碼
   */
  findBySession(sessionId: string): Promise<TaskDTO[]>;

  /**
   * 根據 ID 查找單一任務
   * @param id 任務識別碼
   */
  findById(id: string): Promise<TaskDTO | null>;
}
