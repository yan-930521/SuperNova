import { AgentManager, IAgentModule } from '@core/agent';
import { SessionManager } from '@core/session';
import { EventBus } from '@supernova/events/EventBus';

/**
 * 訊息優先度
 * 影響 SessionManager 排程與是否觸發即時喚醒
 */
export enum MessagePriority {
    URGENT = 100, // 緊急中斷 (如 User 停止指令、遭受攻擊)
    HIGH = 50,    // 高優先 (直接 @提及、任務完成回報)
    NORMAL = 0,   // 一般對話或環境訊息
    LOW = -50,    // 背景雜訊 (微小環境變動，不打斷思考)
}

/**
 * 巨型資料指標 (Data Pointer)
 * 實現「控制面與資料面分離」的核心，避免 EventBus 與記憶體遭遇 OOM
 */
export interface IDataPointer {
    /** 指標類型：實體檔案、虛擬檔案 (VFS)、外部快取、外部 URL */
    type: 'FILE' | 'VFS' | 'CACHE' | 'URL';
    /** 資源定位符 (例如：vfs://session-123/agent-a/data.html 或 file://logs/output.json) */
    uri: string;
    /** 可選：資料的 MIME Type 或附帶的輕量級 Metadata */
    metadata?: Record<string, any>;
}

/**
 * DataBlockRole
 * 定義投遞給 LLM 時的 Message 角色類型
 */
export type DataBlockRole = 'human' | 'ai' | 'system' | 'tool';

/**
 * 序列化後的 DataBlock 資料結構介面
 */
export interface DataBlockData {
    id: string;
    sessionId: string;
    threadId: string | null;
    senderId: string;
    targetId: string | null;
    type: DataBlockRole;
    intent: string;
    priority: MessagePriority;
    timestamp: number;
    controlPayload: any;
    dataPointers: IDataPointer[];
    metadata?: Record<string, any>;
}

/**
 * DataBlock 建構子參數介面
 */
export interface DataBlockParams<TControlPayload = any> {
    id?: string;
    sessionId: string;
    threadId?: string | null;
    senderId: string;
    targetId?: string | null;
    type?: DataBlockRole;
    intent?: string;
    priority?: MessagePriority;
    timestamp?: number;
    controlPayload?: TControlPayload;
    dataPointers?: IDataPointer[];
    metadata?: Record<string, any>;
}

import { AgentConfig } from '../config';

/**
 * 訊息路由器配置選項
 */
export interface MessageRouterOptions {
    /** 代理人配置規格 */
    agent?: AgentConfig;
    /** 事件匯流排實例 */
    eventBus?: EventBus;
    /** 會話管理器實例 */
    sessionManager?: SessionManager;
    /** 代理管理器實例 */
    agentManager?: AgentManager;
    /** 強制喚醒數量門檻 (預設 5) */
    forceWakeupThreshold?: number;
}

/**
 * 訊息路由器介面
 */
export interface IMessageRouter {
    route(block: any): Promise<void>;
    dispatchSessionInbox(sessionId: string, agentId: string): Promise<boolean>;
}
