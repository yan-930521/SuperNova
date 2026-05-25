import { recorder } from '../infra/LogManager';
import { IAgentExecuteContext, IAgentExecuteResult } from '../infra/types/agent';
import { MessageRole } from '../infra/types/session';
import { Session } from '../models/Session';
import { AgentListTool } from '../tool/core/AgentListTool';
import { AgentRegisterTool } from '../tool/core/AgentRegisterTool';
import { TaskAssignTool } from '../tool/core/TaskAssignTool';
import { TaskCreateTool } from '../tool/core/TaskCreateTool';
import { TaskDispatcherTool } from '../tool/core/TaskDispatcherTool';
import { TaskInfoTool } from '../tool/core/TaskInfoTool';
import { TaskListTool } from '../tool/core/TaskListTool';
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

		// 核心編排與查詢工具
		this.registerTool(new TaskDispatcherTool());
		this.registerTool(new TaskCreateTool());
		this.registerTool(new TaskAssignTool());
		this.registerTool(new TaskListTool());
		this.registerTool(new TaskInfoTool());
		this.registerTool(new AgentListTool());
		this.registerTool(new AgentRegisterTool());
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

		if (!this.reactAgent) {
			this.buildExecutionEngine();
		}

		// 1. 記錄使用者訊息到 Session
		session.addMessage(MessageRole.USER, message);

		try {
			// 2. 執行 ReAct 引擎 (直接傳遞 Session 中的 BaseMessage[] 歷史)
			const resultState = await this.reactAgent.invoke({
				messages: session.history
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
			session.addMessage(MessageRole.ASSISTANT, finalResponse);
			return finalResponse;

		} catch (error: any) {
			recorder.error(`MainAgent ReAct execution failed: ${error.message}`, { session_id: session.id });
			return `抱歉，我在處理您的請求時遇到錯誤：${error.message}`;
		}
	}
}
