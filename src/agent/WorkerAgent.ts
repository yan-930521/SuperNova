import { BaseAgent } from './BaseAgent';
import { IWorkerAgent } from '../../interfaces/agent/IWorkerAgent';
import { IToolRegistry } from '../../interfaces/tool/IToolRegistry';

/**
 * WorkerAgent 實作
 * 負責執行具體工具的代理。
 */
export class WorkerAgent extends BaseAgent implements IWorkerAgent {
  constructor(private toolRegistry: IToolRegistry) {
    super();
  }

  async executeIntent(intent: any): Promise<any> {
    const { toolName, input } = intent;
    const tool = this.toolRegistry.getTool(toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const context = {
      sessionId: 'default-session',
      agentId: this.id,
      traceId: `trace-${Date.now()}`
    };

    // 如果輸入是物件且包含 data 欄位，則將 data 作為工具的輸入
    // 這樣可以相容於直接傳入參數或傳入整個 TaskNode 的情況
    const toolInput = (input && typeof input === 'object' && 'data' in input) 
      ? input.data 
      : input;

    return await tool.run(toolInput, context);
  }
}
