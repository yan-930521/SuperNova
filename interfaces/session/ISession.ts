import { IMiddleware } from './IMiddleware';

/**
 * 會話核心接口
 */
export interface ISession {
  /** 會話 UUID */
  id: string;
  /** 當前狀態 */
  status: string;
  /** 初始目標 */
  goal: string;
  
  /** 驅動會話運行的核心循環 */
  tick(): Promise<void>;
  
  /** 導出全鏈路操作日誌 */
  exportLog(): Promise<string>;

  /** 序列化為 JSON */
  toJSON(): Record<string, any>;
  
  /** 從 JSON 加載狀態 */
  loadFromJSON(data: Record<string, any>): Promise<void>;

  /** 
   * 創建當前會話狀態的快照 
   * @returns 快照 ID
   */
  snapshot(): Promise<string>;

  /** 
   * 將會話回滾到指定的快照點 
   * @param checkpointId 快照或檢查點 ID
   */
  rollback(checkpointId: string): Promise<void>;

  /** 
   * 註冊中間件到指定的執行流水線 
   * @param pipeline 流水線類型: 'TOOL' (工具調用) 或 'MUTATION' (狀態變更)
   * @param middleware 中間件實例
   */
  use(pipeline: 'TOOL' | 'MUTATION', middleware: IMiddleware): void;
}
