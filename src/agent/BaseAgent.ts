import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tool as langChainTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { RecordAction, recorder } from '../infra/LogManager';
import { IAgentExecuteContext, IAgentExecuteResult, ModelPreset } from '../infra/types/agent';
import { ITool } from '../tool/BaseTool';
import { PromptLoader } from '../utils/PromptLoader';

import type { GlobalRuntime } from '../runtime/GlobalRuntime';

/**
 * BaseAgent (代理基類)
 * 2.0 版：所有代理均內建 ReAct 執行引擎，具備獨立思考與工具調用能力。
 */
export abstract class BaseAgent {
	public identity: string = '';
	public capabilities: string[] = [];
	/** 可調用的代理白名單 (ID 列表) */
	public availableAgents: string[] = [];
	protected _config: Record<string, any> = {};
	/** 代理的工具箱 */
	protected tools = new Map<string, ITool>();
	/** 預編譯的 ReAct 執行引擎 */
	protected reactAgent: any = null;
	/** 全局運行時實例 (注入) */
	protected runtime?: GlobalRuntime;

	constructor(public id: string, public role: string) {
		// 構造函數保持極簡，避開循環引用
	}

	/**
	 * 注入運行時實例
	 */
	public setRuntime(runtime: GlobalRuntime): void {
		this.runtime = runtime;
	}

	/**
	 * 註冊工具
	 */
	protected registerTool(tool: ITool) {
		this.tools.set(tool.name, tool);
	}

	/**
	 * 註冊系統所有預設工具
	 */
	public registerDefaultTools(): void {
		if (!this.runtime) {
			recorder.warn(`Agent [${this.id}] registerDefaultTools skipped: runtime not injected.`, { type: 'SYSTEM' });
			return;
		}

		// 從 ToolRegistry 獲取通用工具集
		const commonTools = this.runtime.toolRegistry.getToolsByCategories(['common', 'file']);
		commonTools.forEach(t => this.registerTool(t));

		recorder.info(`Agent [${this.id}] registered ${this.tools.size} tools (default).`, { 
			type: 'SYSTEM',
			agent_id: this.id 
		});
	}

	/**
	 * 初始化執行引擎
	 */
	public buildExecutionEngine(model: BaseChatModel): void {
		try {
			// 將 SuperNova BaseTool 包裝為 LangChain 原生工具
			const nativeTools = Array.from(this.tools.values()).map(t => langChainTool(
				async (input, config) => {
					const context = config.configurable?.toolContext || {
						sessionId: 'unknown',
						agentId: this.id,
						traceId: `trace-${Date.now()}`
					};
					// 確保 context 中包含 agentId
					const executeContext: IAgentExecuteContext = {
						...context,
						agentId: context.agentId || this.id
					};
					return await (t as any).execute(input, executeContext);
				},
				{
					name: t.name,
					description: t.description,
					schema: t.schema
				}
			));

			// 建立預編譯 ReAct Agent
			this.reactAgent = createReactAgent({
				llm: model,
				tools: nativeTools,
				messageModifier: (this.identity || `你是一個 AI 代理 (${this.id})。你的角色是 ${this.role}。`)
			});

			recorder.info(`Agent [${this.id}] ReAct Engine built successfully.`, { type: 'SYSTEM' });
		} catch (error: any) {
			recorder.error(`Failed to build execution engine for Agent [${this.id}]: ${error.message}`);
		}
	}

	/**
	 * 核心執行方法：使用 ReAct 引擎執行任務。
	 * 適用於所有繼承自 BaseAgent 的代理。
	 */
	async execute(taskGoal: string, context: IAgentExecuteContext): Promise<IAgentExecuteResult> {
		const { sessionId, traceId } = context;

		if (!this.runtime) {
			throw new Error(`Agent [${this.id}] runtime not injected.`);
		}

		if (!this.reactAgent) {
			const model = this.runtime.modelRegistry.getRawModel(ModelPreset.SMART) as BaseChatModel;
			this.buildExecutionEngine(model);
		}

		// --- 關鍵修正：等待異步 Session 加載 ---
		const session = await this.runtime.sessionManager.getSession(sessionId);
		if (!session) throw new Error(`Session ${sessionId} not found.`);

		recorder.record(RecordAction.TOOL_CALL, `Agent [${this.id}] starting ReAct execution for: ${taskGoal}`, {
			session_id: sessionId,
			agent_id: this.id,
			trace_id: traceId
		});

		try {
			// 執行 ReAct 引擎
			// 我們將任務目標包裝為指令輸入
			const resultState = await this.reactAgent.invoke({
				messages: [
					...session.history,
					{ role: 'user', content: `[DIRECTIVE]: 你當前的任務目標是「${taskGoal}」。請直接開始執行並回報結果。` }
				]
			}, {
				recursionLimit: 50,
				configurable: {
					toolContext: context
				}
			});

			// 獲取產出
			const lastMessage = resultState.messages[resultState.messages.length - 1];
			const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

			recorder.record(RecordAction.STATE_MUTATION, `Agent [${this.id}] finished task: ${taskGoal}`, {
				session_id: sessionId,
				agent_id: this.id,
				trace_id: traceId,
				payload: { content }
			});

			return {
				status: 'success',
				result: { data: content },
				summary: content
			};

		} catch (error: any) {
			recorder.error(`Agent [${this.id}] execution failed: ${error.message}`, { session_id: sessionId, trace_id: traceId });
			return {
				status: 'failed',
				result: null,
				error: error.message,
				summary: `執行任務失敗: ${error.message}`
			};
		}
	}

	/**
	 * 從 JSON 配置初始化或恢復 Agent 狀態
	 */
	async initFromJSON(config: Record<string, any>): Promise<void> {
		const resolvedConfig = await PromptLoader.resolvePrompts(config);

		const { id, role, capabilities, availableAgents, prompts, ...rest } = resolvedConfig;

		if (id) this.id = id;
		if (role) this.role = role;
		if (capabilities) this.capabilities = capabilities;
		if (availableAgents) this.availableAgents = availableAgents;
		if (prompts?.identity) this.identity = prompts.identity;

		this._config = {
			...this._config,
			...rest,
			prompts: prompts || this._config.prompts
		};
	}

	/**
	 * 將 Agent 當前狀態序列化為 JSON
	 */
	toJSON(): Record<string, any> {
		return {
			id: this.id,
			role: this.role,
			capabilities: this.capabilities,
			availableAgents: this.availableAgents,
			prompts: {
				identity: this.identity
			},
			...this._config,
		};
	}
}
