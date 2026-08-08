import { CreateTaskPayload } from '../../domain/ITask';
import { LLMProvider } from '../../infra/llm/LLMProvider';
import { TASK_PROMPTS, DAGSchema } from '../../prompts/task.prompt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export class TaskDAGGenerator {
    constructor(private readonly llmProvider: LLMProvider) {}

    /**
     * 將 LATS 產生的最佳文字策略，翻譯轉換成嚴格的 TaskDAG JSON
     * @param strategy LATS 輸出的最佳軌跡與策略
     */
    public async generate(strategy: string): Promise<CreateTaskPayload[]> {
        const systemPrompt = TASK_PROMPTS.generator.system;

        const model = this.llmProvider.getModel().withStructuredOutput(DAGSchema);
        
        try {
            const result = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Please translate the following final strategy into a TaskDAG:\n\n${strategy}`)
            ]);

            return result.tasks;
        } catch (e) {
            console.error('[TaskDAGGenerator] Translation failed:', e);
            throw new Error('Failed to generate TaskDAG from strategy.');
        }
    }
}
