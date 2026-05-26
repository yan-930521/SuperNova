import { BaseAgent } from './BaseAgent';

/**
 * WorkerAgent (執行代理)
 * 負責執行單一任務節點。
 * 2.0 版：繼承 BaseAgent 的 ReAct 能力，專注於任務執行。
 */
export class WorkerAgent extends BaseAgent {
  /**
   * @param id 代理 ID
   */
  constructor(id: string) {
    super(id, 'WORKER');
    this.registerDefaultTools();
  }
  
  // 使用 BaseAgent 提供的通用的 execute 實作
}
