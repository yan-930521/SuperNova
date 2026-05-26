import { recorder } from '../infra/LogManager';
import { IAgentExecuteContext, IAgentExecuteResult, ModelPreset } from '../infra/types/agent';
import { MessageRole } from '../infra/types/session';
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
	 * 註冊 MainAgent 特有的編排工具
	 */
	public registerDefaultTools(): void {
		super.registerDefaultTools(); // 先註冊通用工具
		if (!this.runtime) return;

		// 從 ToolRegistry 獲取核心編排工具
		const coreTools = this.runtime.toolRegistry.getToolsByCategory('core');
		coreTools.forEach(t => this.registerTool(t));

		recorder.info(`MainAgent [${this.id}] registered ${coreTools.length} core tools.`, { 
			type: 'SYSTEM',
			agent_id: this.id 
		});
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

		// 立即附加使用者訊息到持久層 (使用 BaseMessage 的標準字典格式)
		const userMsg = session.history[session.history.length - 1];
		await this.runtime.sessionManager.appendMessage(session.id, userMsg);

		try {
			// 2. 執行 ReAct 引擎 (直接傳遞 Session 中的 BaseMessage[] 歷史)
			const resultState = await this.reactAgent.invoke({
				messages: session.getLangChainMessages()
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

			// 4. 同步 Session 歷史
			session.addMessage(this.id, MessageRole.ASSISTANT, finalResponse);

			// 5. 附加助理回覆到持久層 (使用 BaseMessage 的標準字典格式)
			const assistantMsg = session.history[session.history.length - 1];
			await this.runtime.sessionManager.appendMessage(session.id, assistantMsg);

			return finalResponse;

		} catch (error: any) {
			recorder.error(`MainAgent ReAct execution failed: ${error.message}`, { session_id: session.id });
			return `抱歉，我在處理您的請求時遇到錯誤：${error.message}`;
		}
	}
}
