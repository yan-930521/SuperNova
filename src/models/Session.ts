import {
    AIMessage, BaseMessage, HumanMessage, mapStoredMessagesToChatMessages, SystemMessage,
    ToolMessage
} from '@langchain/core/messages';

import { SystemEventType } from '../infra/types/events';
import { MessageDTO, MessageRole, SessionDTO } from '../infra/types/session';
import { GlobalRuntime } from '../runtime/GlobalRuntime';

/**
 * 會話狀態 Enum
 */
export enum SessionStatus {
	IDLE = 'IDLE',
	RUNNING = 'RUNNING',
	COMPLETED = 'COMPLETED',
	INTERRUPTED = 'INTERRUPTED',
	CRASHED = 'CRASHED'
}

/**
 * 會話層核心接口
 * 負責追蹤與使用者的對話歷史以及高層次的 Worker 執行摘要。
 */
export interface ISession {
	/** 會話 UUID */
	id: string;
	/** 隸屬的用戶 ID */
	userId: string;
	/** 負責此會話的主代理 ID */
	responsibleAgentId: string;
	/** 當前狀態 */
	status: SessionStatus;
	/** 初始目標 */
	goal: string;
	/** 完整對話歷史 (包含身分數據) */
	history: MessageDTO[];

	/** 
	 * 獲取純 LangChain 訊息序列 
	 * 用於傳遞給推理引擎 (LLM)。
	 */
	getLangChainMessages(): BaseMessage[];

	/** 新增訊息到對話歷史 */
	addMessage(authorId: string, role: MessageRole, content: string, metadata?: Record<string, any>): void;
	/** 轉換為 DTO 用於持久化 */
	toDTO(): SessionDTO;
	/** 從 DTO 加載狀態 */
	initFromDTO(dto: SessionDTO): Promise<void>;
}

/**
 * Session (會話層實體)
 * 負責維護與用戶的「溝通連貫性」。
 */
export class Session implements ISession {
	/** 會話狀態管理 */
	public status: SessionStatus = SessionStatus.IDLE;

	/** 
	 * 對話歷史：系統的「會話總帳」
	 * 封裝了 LangChain 訊息與額外的身分溯源數據。
	 */
	public history: MessageDTO[] = [];

	/** 額外元數據存儲 */
	protected _metadata: Record<string, any> = {};

	/**
	 * 初始化 Session 並設置事件訂閱
	 */
	constructor(
		public id: string,
		public goal: string,
		public responsibleAgentId: string,
		public userId: string = 'default-user'
	) {
		this.setupSubscribers();
	}

	/**
	 * 設置事件訂閱
	 */
	private setupSubscribers() {
		const runtime = GlobalRuntime.getInstance();
		if (!runtime) return;

		const bus = runtime.eventBus;

		// 訂閱 Worker 摘要事件
		bus.subscribe(SystemEventType.TASK_COMPLETED, (event) => {
			if (event.sessionId === this.id) {
				this.addMessage(
					event.payload.agentId || 'system-worker',
					MessageRole.WORKER,
					event.payload.summary || 'Task completed',
					{ taskId: event.payload.taskId }
				);
			}
		});

		// 訂閱生命週期事件
		bus.subscribe(SystemEventType.SESSION_CREATED, (event) => {
			if (event.sessionId === this.id) this.status = SessionStatus.RUNNING;
		});
	}

	/**
	 * 獲取純 LangChain 訊息序列
	 */
	public getLangChainMessages(): BaseMessage[] {
		return this.history.map(item => item.message);
	}

	/**
	 * 新增訊息到對話歷史
	 * @param authorId 發送者 ID (User ID 或 Agent ID)
	 * @param role 角色 (Enum)
	 * @param content 訊息內容
	 * @param metadata 額外元數據
	 */
	addMessage(authorId: string, role: MessageRole, content: string, metadata: Record<string, any> = {}) {
		let message: BaseMessage;

		switch (role) {
			case MessageRole.USER:
				message = new HumanMessage({ content });
				break;
			case MessageRole.ASSISTANT:
				message = new AIMessage({ content });
				break;
			case MessageRole.SYSTEM:
				message = new SystemMessage({ content });
				break;
			case MessageRole.TOOL:
				message = new ToolMessage({
					content,
					tool_call_id: metadata.tool_call_id || `tool-${Date.now()}`
				});
				break;
			case MessageRole.WORKER:
				message = new AIMessage({
					content: `[Worker Observation] ${content}`,
					additional_kwargs: { is_worker_summary: true, ...metadata }
				});
				break;
			default:
				message = new SystemMessage({ content: `[${role}] ${content}` });
		}

		// 封裝為 MessageDTO
		const dto: MessageDTO = {
			message,
			identity: {
				role,
				authorId,
				name: metadata.authorName || authorId,
				...metadata
			}
		};

		this.history.push(dto);
	}

	/**
	 * 轉換為 DTO
	 */
	toDTO(): SessionDTO {
		return {
			id: this.id,
			userId: this.userId,
			responsibleAgentId: this.responsibleAgentId,
			goal: this.goal,
			status: this.status.toString(),
			history: this.history, // MessageDTO[]
			metadata: this._metadata
		};
	}

	/**
	 * 從 DTO 初始化
	 */
	async initFromDTO(dto: SessionDTO): Promise<void> {
		this.id = dto.id;
		this.userId = dto.userId;
		this.responsibleAgentId = dto.responsibleAgentId;
		this.goal = dto.goal;
		this.status = dto.status as SessionStatus;

		if (dto.history && Array.isArray(dto.history)) {
			// 將存儲的 JSON 數據還原為 MessageDTO
			this.history = dto.history.map(item => {
				// 使用 LangChain 的工具將儲存的訊息字典轉回訊息對象
				const chatMessages = mapStoredMessagesToChatMessages([item.message as any]);
				return {
					message: chatMessages[0],
					identity: item.identity
				};
			});
		}

		this._metadata = dto.metadata || {};
	}
}
