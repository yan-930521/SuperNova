/**
 * 會話定義 Schema
 * 用於描述 Session 的初始化配置與狀態結構。
 */
export type SessionDefinitionSchema = {
  /** 會話唯一的 UUID */
  id: string;
  /** 初始任務目標 */
  goal: string;
  /** 使用的領域系統名稱 */
  vertical_system: string;
  /** 執行的強制約束條件 */
  constraints: string[];
  /** 可選的初始世界狀態 */
  initial_state?: any;
  /** 可選的快照元數據 (用於恢復) */
  snapshot_meta?: {
    last_checkpoint_id?: string;
    timestamp?: number;
  };
}
