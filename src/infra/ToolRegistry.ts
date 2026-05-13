import type { IToolRegistry } from '../../interfaces/infra/IToolRegistry';
import type { ITool } from '../../interfaces/tool/ITool';

/**
 * ToolRegistry 實作
 * 負責系統中所有可用工具的註冊、查找與列表管理。
 */
export class ToolRegistry implements IToolRegistry {
  /** 內部存儲工具的 Map，鍵為工具名稱 */
  private tools: Map<string, ITool> = new Map();

  /**
   * 註冊一個新工具
   * 如果名稱已存在，則覆蓋原有工具並記錄警告日誌。
   * @param tool 實現了 ITool 接口的工具實例
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    } else {
      console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 根據名稱獲取工具實例
   * @param name 工具的唯一名稱
   */
  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * 列出所有已註冊的工具
   */
  listTools(): ITool[] {
    return Array.from(this.tools.values());
  }
}
