import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { Events } from '../core/messaging/IBus';
import { UserSession } from '../domain/session/UserSession';
import { recorder } from '../infra/LogManager';
import { AgentType, ModelPreset } from '../infra/types/agent';
import { MessageRole } from '../infra/types/session';
import { BaseAgent } from './BaseAgent';

/**
 * MainAgent (主代理)
 * 負責接收使用者訊息、維護會話歷史，並透過繼承自 BaseAgent 的 ReAct 模式進行思考與工具調用。
 */
export class MainAgent extends BaseAgent {
	/**
	 * @param id 代理 ID
	 */
	constructor(id: string) {
		super(id, AgentType.MAIN_AGENT);
	}

	/**
	 * 處理使用者訊息 (會話入口)
	 * 這是針對「用戶直接對話」的特殊優化。
	 */
	async handleUserMessage(session: UserSession, message: string, requesterId: string = 'user'): Promise<string> {
		recorder.info(`MainAgent [${this.id}] handling message from [${requesterId}]`, {
			session_id: session.id,
			type: 'LIFECYCLE'
		});

		if (!this.deps) {
			throw new Error(`Agent [${this.id}] dependencies not injected.`);
		}

		if (!this.reactAgent) {
			const model = this.deps.modelRegistry.getRawModel(ModelPreset.SMART);
			this.buildExecutionEngine(model);
		}

		const dynamicSystemPrompt = await this.buildPrompt({
			sessionId: session.id
		});

		try {
			// 將 Session 歷史進行摺疊以節省 Token
			const foldedSessionHistory = this.deps.memoryService.foldHistory(session.history);

			// 2. 執行 ReAct 引擎
			const resultState = await this.reactAgent.invoke({
				messages: [
					new SystemMessage(dynamicSystemPrompt),
					...foldedSessionHistory.map((mDTO: any) => mDTO.message)
				]
			}, {
				recursionLimit: 50,
				configurable: {
					toolContext: {
						sessionId: session.id,
						agentId: this.id,
						traceId: `trace-${Date.now()}`
					}
				}
			});

			// 3. 獲取最後的回覆
			const lastMessage = resultState.messages[resultState.messages.length - 1];
			const finalResponse = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

			// 4. 發布發言事件
			this.deps.eventBus.publish({
				type: Events.Session.Updated,
				timestamp: Date.now(),
				payload: {
					sessionId: session.id,
					lastSummary: finalResponse
				}
			});

			return finalResponse;

		} catch (error: any) {
			recorder.error(`MainAgent ReAct execution failed: ${String(error)}`, { session_id: session.id });
			return `抱歉，我在處理您的請求時遇到錯誤：${String(error)}`;
		}
	}
}
