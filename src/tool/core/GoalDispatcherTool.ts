import { z } from 'zod';

import { DispatchTaskCommand } from '../../../src_bk/TaskService';
import { Commands, IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseTool } from '../BaseTool';

/**
 * GoalDispatcherTool
 * 負責將高層次的目標提交給系統，觸發自動分階段規劃與執行。
 */
export class GoalDispatcherTool extends BaseTool {
	constructor() {
		super({
			name: 'goal_dispatcher',
			description: "Submit a high-level goal and its self-contained context to the SuperNova execution system. The backend handles planning and execution.",
			category: 'core',
			safety_tier: 'TIER_2',
			required_capabilities: ['planning', 'reasoning'],
			schema: z.object({
				goal: z.string().describe('The high-level objective or desired outcome.'),
				description: z.string().describe(`A fully self-contained, execution-ready mission spec.

It MUST include ALL information required for downstream execution without relying on:
- conversation history
- external chain state
- implicit assumptions
- hidden context

Must contain:
1. Objective clarification (what "done" means)
2. Required inputs or data (or explicit UNKNOWN)
3. Constraints and rules
4. Expected output format
5. Success criteria / verification condition

If any information is missing, it MUST explicitly state UNKNOWN instead of omitting.`),
			})
		});
	}

	async run(input: any, context: IAgentExecuteContext): Promise<any> {
		const { goal, description } = input;
		const { sessionId } = context;
		const runtime = GlobalRuntime.getInstance();

		try {
			// 建立新的任務鏈 ID
			const chainId = `chain-${Date.now()}`;

			// 透過 CommandBus 發送分派指令，由 TaskService 接收
			await runtime.commandBus.send(
				new DispatchTaskCommand({
					chainId,
					sessionId,
					goal,
					description,
					traceId: context.traceId
				})
			)

			return {
				message: "Goal submitted successfully. Phased planning and execution initiated.",
				chainId: chainId,
				traceId: context.traceId
			};
		} catch (error: any) {
			return {
				message: `Failed to dispatch goal: ${error.message}`,
				status: "failed"
			};
		}
	}
}
