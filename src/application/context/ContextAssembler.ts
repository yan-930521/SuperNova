import { Task } from '../../domain/task/Task';

/**
 * ContextAssembler (上下文組裝專家)
 * 職責: 根據任務的依賴關係與背景，組裝出供 Agent 執行的 Markdown Prompt。
 * 遵循「最小化投影」原則，僅注入必要的摘要與歷史。
 */
export class ContextAssembler {
  /**
   * 組裝任務上下文
   * @param task 當前要執行的任務
   * @param dependencies 依賴的任務實體列表
   */
  public static assemble(task: Task, dependencies: Task[]): string {
    const sections: string[] = [];

    // 1. 任務核心背景
    sections.push('# 任務執行上下文');
    sections.push(`## 核心目標\n${task.goal}`);
    
    if (task.description) {
      sections.push(`## 任務描述\n${task.description}`);
    }

    if (task.context) {
      sections.push(`## 靜態背景\n${task.context}`);
    }

    // 2. 注入依賴項產出的摘要 (而非完整歷史)
    if (dependencies.length > 0) {
      sections.push('## 前置任務產出摘要');
      for (const dep of dependencies) {
        const summary = dep.output || '無具體產出摘要';
        sections.push(`### 任務: ${dep.id}\n- 目標: ${dep.goal}\n- 產出摘要: ${summary}`);
      }
    }

    // 3. 驗證標準 (DoD)
    if (task.successCriteria) {
      sections.push(`## 驗證標準 (Definition of Done)\n${task.successCriteria}`);
    }

    return sections.join('\n\n');
  }
}
