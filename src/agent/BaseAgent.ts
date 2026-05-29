import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
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
	/** 代理可使用的具體工具 ID 列表 */
	public toolsList: string[] = [];
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

		if (this.toolsList && this.toolsList.length > 0) {
			// 如果指定了工具列表，則根據路徑規則導入
			this.toolsList.forEach(toolPath => {
				if (toolPath.endsWith('.*')) {
					// 處理分類批次導入，例如 "common.*"
					const category = toolPath.split('.')[0];
					const tools = this.runtime?.toolRegistry.getToolsByCategory(category);
					tools?.forEach(t => this.registerTool(t));
				} else if (toolPath.includes('.')) {
					// 處理精確路徑導入，例如 "file.write_file"
					const [category, name] = toolPath.split('.');
					const tool = this.runtime?.toolRegistry.getToolsByCategory(category).find(t => t.name === name);
					if (tool) {
						this.registerTool(tool);
					} else {
						recorder.warn(`Agent [${this.id}] tool [${name}] not found in category [${category}].`, { type: 'SYSTEM' });
					}
				} else {
					// 全局搜尋 (相容舊格式)
					const tool = this.runtime?.toolRegistry.getTool(toolPath);
					if (tool) {
						this.registerTool(tool);
					} else {
						recorder.warn(`Agent [${this.id}] tool [${toolPath}] not found in global registry.`, { type: 'SYSTEM' });
					}
				}
			});
		}

		recorder.info(`Agent [${this.id}] registered ${this.tools.size} tools.`, {
			type: 'SYSTEM',
			agent_id: this.id
		});
	}

	/**
	 * 建立系統提示詞 (System Prompt)
	 * 整合身份、能力標籤、可用資源與當前執行狀態。
	 */
	protected async buildPrompt(context: Partial<IAgentExecuteContext>): Promise<string> {
		let prompt = this.identity || `你是一個 AI 代理 (${this.id})。你的角色是 ${this.role}。`;

		if (this.availableAgents && this.availableAgents.length > 0) {
			prompt += `\n\n你可以調度的下屬代理列表 (透過 task_create )：\n- ${this.availableAgents.join('\n- ')}`;
		}

		// 注入當前執行環境資訊 (Working Memory)
		if (context?.taskId) {
			prompt += `\n\n--- 當前執行狀態 ---`;
			prompt += `\n- 任務 ID: ${context.taskId || "None"}`;

			// 前置任務結果注入
			if (context.dependencyResults && Object.keys(context.dependencyResults).length > 0) {
				prompt += `\n\n--- 前置任務執行結果 ---`;
				for (const [depId, result] of Object.entries(context.dependencyResults)) {
					prompt += `\n[任務 ${depId}]:\n${result}\n`;
				}
			}

			// 重試與錯誤處理引導
			if (context.retryCount && context.retryCount > 0) {
				prompt += `\n- 重試次數: ${context.retryCount}`;
				prompt += `\n- 上次失敗原因: ${context.lastError || '未知錯誤'}`;
				prompt += `\n\n[注意]: 這是此任務的第 ${context.retryCount} 次重試。請仔細分析上次失敗原因，嘗試更換策略或修正參數，避免重複失敗。`;
			}
		}

		// 行為準則 (原本 Meta-Memory 的核心精神，以專案風格呈現)
		prompt += `\n\n--- 行為準則 ---`;
		prompt += `\n1. 嚴禁在未經工具驗證的情況下假設環境狀態或檔案內容。`;
		prompt += `\n2. 優先檢索資源索引，若需詳細資訊，必須調用 'read_file' 或相關檢索工具。`;
		prompt += `\n3. 每一輪動作後，請評估是否達成了階段性目標或需記錄關鍵資訊。`;

		return prompt;
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
			// 注意：我們不在這裡固定 messageModifier，而是在 invoke 時動態處理
			this.reactAgent = createReactAgent({
				llm: model,
				tools: nativeTools
			});

			recorder.info(`Agent [${this.id}] ReAct Engine built successfully.`, { type: 'SYSTEM' });
		} catch (error: any) {
			recorder.error(`Failed to build execution engine for Agent [${this.id}]: ${error.message}`);
		}
	}

	/**
	 * 核心執行方法：使用 ReAct 引擎執行任務。
	 * 適用於所有繼承自 BaseAgent 的代理。
	 * Agent將作為子節點被呼叫。
	 */
	async execute(taskGoal: string, context: IAgentExecuteContext): Promise<IAgentExecuteResult> {
		const { sessionId, traceId, taskId } = context;

		if (!this.runtime) {
			throw new Error(`Agent [${this.id}] runtime not injected.`);
		}

		if (!this.reactAgent) {
			const model = this.runtime.modelRegistry.getRawModel(ModelPreset.SMART) as BaseChatModel;
			this.buildExecutionEngine(model);
		}

		const session = await this.runtime.sessionManager.getSession(sessionId);
		if (!session) throw new Error(`Session ${sessionId} not found.`);

		// --- 關鍵變更：動態構建分層提示詞 ---
		const dynamicSystemPrompt = await this.buildPrompt(context);

		recorder.record(RecordAction.TOOL_CALL, `Agent [${this.id}] starting ReAct execution for: ${taskGoal}`, {
			session_id: sessionId,
			agent_id: this.id,
			trace_id: traceId
		});

		try {
			// 決定要注入的上下文 (上下文隔離)
			let messages: BaseMessage[] = [];

			if (taskId) {
				// 情況 A：作為 Worker 執行特定 Task
				// 透過 taskId 從 Repository 查詢任務，獲取專屬歷史
				const taskDto = await this.runtime.taskRepo.findById(taskId);
				if ((taskDto  && taskDto.history.length == 0) || !taskDto) {
					messages = [
						new SystemMessage(dynamicSystemPrompt),
						new HumanMessage(`[DIRECTIVE]:\n- Goal: ${taskGoal}\n- Description: ${taskDto ? taskDto.description : "None"}`)
					]
				} else {
					// 這邊代表經過 retry 了，因為history是完整執行之後才會存。
					// 還原 BaseMessage
					const taskLangChainMessages = taskDto.history.map((m) => m.message);
					messages = [...taskLangChainMessages];
				} 

			} else {
				// 情況 B：作為 MainAgent 處理對話 
				// 這邊應該是作為子任務節點被呼叫，因此是特例。
				messages = [
					new SystemMessage(dynamicSystemPrompt),
					...session.getLangChainMessages(), // 引入全局對話歷史
				];
			}

			// 執行 ReAct 引擎
			const resultState = await this.reactAgent.invoke({
				messages: messages
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

			// 回傳時，將完整的內部執行軌跡傳出去，讓 TaskManager 可以存進 task.history
			return {
				status: 'success',
				result: { content, history: resultState.messages }, // 將 messages 包進 result
				summary: content
			};

		} catch (error: any) {
			recorder.error(`Agent [${this.id}] execution failed: ${error.message}`, { session_id: sessionId, trace_id: traceId });
			return {
				status: 'failed',
				result: {
					content: `執行任務失敗: ${error.message}`,
					history: [] // TODO: fix this
				},
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

		const { id, role, capabilities, tools, availableAgents, prompts, ...rest } = resolvedConfig;

		if (id) this.id = id;
		if (role) this.role = role;
		if (capabilities) this.capabilities = capabilities;
		if (tools) this.toolsList = tools;
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
			tools: this.toolsList,
			availableAgents: this.availableAgents,
			prompts: {
				identity: this.identity
			},
			...this._config,
		};
	}
}
