import { IAgentComponent } from '../../interfaces/agent/IAgentComponent';
import { TaskPlanEngine } from './TaskPlanEngine';
import { ThoughtEngine } from './ThoughtEngine';
import { IModelRegistry } from '../../interfaces/runtime/IModelRegistry';

/**
 * 代理組件工廠類
 * 負責根據組件類型名稱實例化對應的組件。
 */
export class AgentComponentFactory {
  /**
   * 根據類型名稱創建組件實例
   * @param type 組件類型 (例如: 'LANGGRAPH_PLANNER', 'THOUGHT_TREE')
   * @param modelRegistry 模型註冊表，用於組件內部的推理引擎獲取
   * @returns 實例化的組件
   */
  static createComponent(type: string, modelRegistry: IModelRegistry): IAgentComponent {
    switch (type) {
      case 'LANGGRAPH_PLANNER':
        // 暫時轉為 any，因為 TaskPlanEngine 尚未完全實作 IAgentComponent 介面 (Task 4 處理)
        return new TaskPlanEngine(modelRegistry) as any;
      case 'THOUGHT_TREE':
        // 暫時轉為 any，因為 ThoughtEngine 尚未完全實作 IAgentComponent 介面 (Task 4 處理)
        return new ThoughtEngine(modelRegistry) as any;
      default:
        throw new Error(`Unknown component type: ${type}`);
    }
  }
}
