export abstract class BaseAgent {
  constructor(public id: string, public role: string) {}
  
  // 核心執行方法，接收任務內容與上下文，回傳結果與摘要
  abstract execute(taskGoal: string, context: any): Promise<{ result: any; summary: string }>;
}
