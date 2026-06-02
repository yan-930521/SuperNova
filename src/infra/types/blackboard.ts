/**
 * 黑板系統介面 (Blackboard Interface)
 * 提供 Agent 存取 L1 Cache 的標準方法
 */
export interface IBlackboard {
  /** 寫入或更新黑板狀態 */
  write(key: string, value: any): void;
  
  /** 獲取黑板變數的具體值 */
  read(key: string): any | null;
  
  /** 列出當前黑板所有可用的 Key */
  listKeys(): string[];
  
  /** 獲取當前黑板所有數據的快照 */
  getSnapshot(): Record<string, any>;
}
