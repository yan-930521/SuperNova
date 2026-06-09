import { IAgentEventPayload } from '../../core/messaging/IBus';
import { recorder } from '../../infra/LogManager';
import { PromptLoader } from '../../utils/PromptLoader';

/**
 * 上下文服務 (ContextService)
 * 負責將記憶層級 (L1/L2/L3) 投影為 Agent 可理解的結構化 Prompt。
 * 核心策略：Key-Only 注入，節省 Token 並強迫 Agent 顯式檢索。
 */
export class ContextService {
  private template: string;

  constructor() {
    // 加載統一的 Prompt 模板
    this.template = PromptLoader.load('prompts/common/agent_template.md');
    if (!this.template) {
      recorder.warn('[ContextService] Prompt template not found, using empty string.', { type: 'SYSTEM' });
      this.template = '';
    }
  }

  /**
   * 根據 Agent 角色與黑板狀態渲染 Prompt
   * @param identityPrompt 完整的角色身分定義內容
   * @param payload 當前事件負載 (包含 sessionId, traceId, goal 等)
   * @param blackboardKeys 當前 L1 黑板中的所有 Key 列表
   */
  public renderPrompt(identityPrompt: string, payload: IAgentEventPayload, blackboardKeys: string[]): string {
    const metadata = payload.metadata || {};

    // 1. Task Constraints
    const taskConstraints = [
      `- Objective: ${payload.goal || 'No objective provided'}`,
      `- Deadline: ${metadata.deadline || 'ASAP'}`,
      `- Scope: ${metadata.scope || 'Current workspace'}`
    ].join('\n');

    // 2. Emphasized Constraints
    const emphasizedConstraints = metadata.emphasis || 'No specific prioritized mandates.';

    // 3. Memory & Context - 分類黑板 Key (Key-Only 策略)
    const factKeys = blackboardKeys.filter(k => k.startsWith('fact_'));
    const varKeys = blackboardKeys.filter(k => !k.startsWith('fact_'));

    const l1Blackboard = varKeys.length > 0 
      ? varKeys.map(k => `- ${k}`).join('\n') 
      : 'None';
    
    const l2Facts = factKeys.length > 0 
      ? factKeys.map(k => `- ${k}`).join('\n') 
      : 'None (Use tools to search L2 index if needed)';

    const l3Sop = metadata.sop_summary || 'No applicable SOPs found for this task.';

    // 4. 執行模板替換
    return this.template
      .replace('{{AGENT_IDENTITY}}', identityPrompt)
      .replace('{{TASK_CONSTRAINTS}}', taskConstraints)
      .replace('{{EMPHASIZED_CONSTRAINTS}}', emphasizedConstraints)
      .replace('{{L1_BLACKBOARD}}', l1Blackboard)
      .replace('{{L2_FACTS}}', l2Facts)
      .replace('{{L3_SOP}}', l3Sop);
  }

  /**
   * 更新模板 (用於熱更新)
   */
  public refreshTemplate(): void {
    PromptLoader.clearCache();
    this.template = PromptLoader.load('prompts/common/agent_template.md');
  }

}
