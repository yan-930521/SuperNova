import { IMutationRequest } from './models';

/**
 * 操作日誌接口 (OpLog)
 * 用於全鏈路因果追蹤。
 */
export interface IOpLog {
  /** 寫入一條日誌記錄 */
  append(type: string, payload: any): Promise<void>;
  /** 查詢符合條件的日誌流 */
  query(filter: Record<string, any>): Promise<any[]>;
}

/**
 * 就緒隊列接口 (ReadyQueue)
 * 用於 DAG 任務並行調度。
 */
export interface IReadyQueue {
  /** 將任務推入隊列 */
  push(taskId: string): void;
  /** 從隊列中取出下一個可執行的任務 */
  pop(): string | null;
  /** 獲取當前隊列中積壓的任務總數 */
  readonly length: number;
}

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
}

/**
 * 會話定義 Schema
 * 用於描述 Session 的初始化配置。
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
}
