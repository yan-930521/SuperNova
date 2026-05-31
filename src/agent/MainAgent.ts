import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { recorder } from '../infra/LogManager';
import { IAgentExecuteContext, IAgentExecuteResult, ModelPreset } from '../infra/types/agent';
import { IAgentMessagePayload, SystemEventType } from '../infra/types/events';
import { MessageRole } from '../infra/types/session';
import { ChainStatus } from '../infra/types/task';
import { Session } from '../models/Session';
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
		super(id, 'MAIN_AGENT');
	}

	/**
	 * 處理使用者訊息 (會話入口)
	 * 這是針對「用戶直接對話」的特殊優化。
	 */
	async handleUserMessage(session: Session, message: string, requesterId: string = 'user'): Promise<string> {
		recorder.info(`MainAgent [${this.id}] handling message from [${requesterId}]`, {
			session_id: session.id,
			type: 'LIFECYCLE'
		});

		if (!this.runtime) {
			throw new Error(`Agent [${this.id}] runtime not injected.`);
		}

		if (!this.reactAgent) {
			const model = this.runtime.modelRegistry.getRawModel(ModelPreset.SMART);
			this.buildExecutionEngine(model);
		}

		// 1. 記錄使用者訊息到 Session
		session.addMessage(session.userId, MessageRole.USER, message);

		const dynamicSystemPrompt = await this.buildPrompt({
			sessionId: session.id
		});

		try {
			// 將 Session 歷史進行摺疊以節省 Token
			const foldedSessionHistory = this.runtime.memoryManager.foldHistory(session.history);

			// 2. 執行 ReAct 引擎
			const resultState = await this.reactAgent.invoke({
				messages: [
					new SystemMessage(dynamicSystemPrompt),
					...foldedSessionHistory.map(mDTO => mDTO.message)
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

			// 4. 發布發言事件 (取代原本的 session.addMessage)
			this.runtime.eventBus.publish<IAgentMessagePayload>({
				type: SystemEventType.AGENT_MESSAGE,
				userId: session.userId,
				sessionId: session.id,
				payload: {
					agentId: this.id,
					sessionId: session.id,
					role: MessageRole.ASSISTANT,
					content: finalResponse,
					messageType: 'reply'
				},
				timestamp: Date.now()
			});

			return finalResponse;

		} catch (error: any) {
			recorder.error(`MainAgent ReAct execution failed: ${String(error)}`, { session_id: session.id });
			return `抱歉，我在處理您的請求時遇到錯誤：${String(error)}`;
		}
	}

	/**
	 * 處理任務鏈結案
	 */
	public async handleChainCompletion(sessionId: string, chainId: string) {
		try {
			const session = await this.runtime?.sessionManager.getSession(sessionId);
			if (!session) return;

			if (!this.reactAgent) {
				const model = this.runtime?.modelRegistry.getRawModel(ModelPreset.SMART);
				if (model) this.buildExecutionEngine(model);
			}

			// 1. 從 TaskManager 獲取該 Chain 的所有任務結果摘要
			const tasks = this.runtime?.taskManager.getChainTasks(chainId) || [];
			const chainSummary = tasks.map(t => `- [${t.goal}]: ${t.result || '無產出'}`).join('\n');

			// 2. 構建深度總結指令
			const summaryDirective = `[SYSTEM NOTIFICATION]: 任務鏈 [${chainId}] 執行完畢。`;

			const dynamicSystemPrompt = await this.buildPrompt({ sessionId });

			// 3. 呼叫 ReAct 引擎進行總結
			const resultState = await this.reactAgent.invoke({
				messages: [
					new SystemMessage(dynamicSystemPrompt),
					...session.getLangChainMessages(), // 使用完整歷史進行結案
					new HumanMessage(summaryDirective)
				]
			}, {
				recursionLimit: 20, // 總結不需要太長
				configurable: {
					toolContext: {
						sessionId,
						agentId: this.id,
						traceId: `trace-summary-${Date.now()}`
					}
				}
			});

			// 4. 獲取 LLM 思考後的最終結報
			const lastMessage = resultState.messages[resultState.messages.length - 1];
			const finalReport = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

			// 5. 發布發言事件 (取代原本的 session.addMessage)
			this.runtime?.eventBus.publish<IAgentMessagePayload>({
				type: SystemEventType.AGENT_MESSAGE,
				userId: session.userId,
				sessionId: session.id,
				payload: {
					agentId: this.id,
					sessionId: session.id,
					role: MessageRole.ASSISTANT,
					content: finalReport,
					messageType: 'summary',
					chainId: chainId
				},
				timestamp: Date.now()
			});

			recorder.info(`[MainAgent] Automatically triggered ReAct summary for chain ${chainId}`, { session_id: sessionId });

		} catch (error: any) {
			recorder.error(`[MainAgent] Failed to handle chain completion summary: ${error.message}`);
		}
	}
}
