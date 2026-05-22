import { BaseAgent } from './BaseAgent';

export class WorkerAgent extends BaseAgent {
  async execute(taskGoal: string, context: any) {
    // 這裡未來會接真實 LLM
    const summary = `Executed: ${taskGoal} using context from ${Object.keys(context).join(', ')}`;
    return { result: { status: 'success' }, summary };
  }
}
