import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { BaseTool } from '../BaseTool';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { ModelPreset } from '../../infra/ModelRegistry';

/**
 * TextSummarizerTool
 * 使用系統智能模型對長文本進行摘要。
 */
export class TextSummarizerTool extends BaseTool {
  constructor() {
    super(
      'text_summarizer',
      'Summarize long text into concise insights.',
      'TIER_1',
      ['utility'],
      z.object({
        text: z.string().describe('The long text to summarize.'),
        max_words: z.number().optional().default(100).describe('Target summary length in words.')
      })
    );
  }

  async run(input: { text: string; max_words: number }, _context: IAgentExecuteContext): Promise<any> {
    const runtime = GlobalRuntime.getInstance();
    const model = runtime.modelRegistry.getModel(ModelPreset.FAST); // 使用快速模型進行摘要
    
    const prompt = `Please summarize the following text in approximately ${input.max_words} words:\n\n${input.text}`;
    
    try {
      // 這裡直接封裝為推理請求
      const summary = await model.withSystemPrompt("You are a professional summarizer.").infer({
        goal: "Summarize text",
        messages: [{ role: 'user', content: prompt } as any],
        planning: { milestones: [], currentMilestoneIdx: 0, taskGraph: null, projectedContext: {} },
        thoughtTree: { nodes: [], rootId: null, activeNodeId: null, iterationCount: 0 },
        currentTask: "Summarization",
        lastEvaluations: [],
        errors: []
      }, z.object({ summary: z.string() }));

      return {
        originalLength: input.text.length,
        summary: summary.summary
      };
    } catch (error: any) {
      throw new Error(`Summarization failed: ${error.message}`);
    }
  }
}
