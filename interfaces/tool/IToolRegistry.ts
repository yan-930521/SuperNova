import type { ITool } from './ITool';

/**
 * 工具註冊表接口
 * 負責系統中所有可用工具的發現與管理。
 */
export interface IToolRegistry {
  /** 
   * 註冊一個新工具 
   * @param tool 實現了 ITool 接口的工具實例
   */
  register(tool: ITool): void;

  /** 
   * 根據名稱獲取工具實例
   * @param name 工具的唯一名稱
   */
  getTool(name: string): ITool | undefined;

  /** 
   * 列出所有已註冊的工具
   */
  listTools(): ITool[];
}
