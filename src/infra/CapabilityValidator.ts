import { IAgent } from '../../interfaces/agent/IAgent';
import { ITool } from '../../interfaces/tool/ITool';

/**
 * 能力驗證器 (Capability Validator)
 * 負責在工具執行前驗證 Agent 是否具備對應的權限標籤。
 */
export class CapabilityValidator {
  /**
   * 驗證 Agent 是否具備執行工具的所有必要能力
   * @param agent 要校驗的智能體
   * @param tool 要執行的工具
   * @returns 是否通過驗證
   */
  static validate(agent: IAgent, tool: ITool): boolean {
    const required = tool.required_capabilities;

    // 如果工具不需要任何能力，直接通過
    if (!required || required.length === 0) {
      return true;
    }

    // 直接從 Agent 屬性獲取能力列表
    const agentCapabilities: string[] = agent.capabilities || [];

    // 檢查是否包含所有要求的能力 (ALL match)
    const hasAll = required.every(cap => agentCapabilities.includes(cap));
    
    if (!hasAll) {
      console.warn(`[CapabilityValidator] Agent ${agent.id} missing capabilities for ${tool.name}. Required: ${required}`);
    }

    return hasAll;
  }
}
