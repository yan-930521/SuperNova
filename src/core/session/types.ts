import { EventBus } from '@supernova/events/EventBus';

import { DataBlock, DataBlockData, MessagePriority } from '../messaging';

/**
 * 會話生命週期狀態機
 */
export enum SessionState {
    /** 活躍中：Agent 可正常接收訊息並進行思考決策 */
    ACTIVE = 'ACTIVE',
    /** 暫停中：凍結收件箱分發，通常用於人機協同等待或調試 */
    PAUSED = 'PAUSED',
    /** 已關閉：對話/任務結束或歸檔，轉為唯讀狀態，拒絕新訊息 */
    CLOSED = 'CLOSED',
}

/**
 * 序列化後的會話資料結構介面 (供持久化儲存庫使用)
 */
export interface SessionData {
    id: string;
    status: SessionState;
    closeReason?: string;
    metadata: Record<string, any>;
    participantIds: string[];
    createdAt: number;
    updatedAt: number;
    inboxBuffer: Record<string, DataBlockData[]>;
}

/**
 * Session 建構子參數介面
 */
export interface SessionParams {
    id?: string;
    status?: SessionState;
    closeReason?: string;
    metadata?: Record<string, any>;
    participantIds?: string[];
    createdAt?: number;
    updatedAt?: number;
    inboxBuffer?: Record<string, (DataBlock | DataBlockData)[]>;
}

/**
 * 會話實體介面 (ISession)
 */
export interface ISession {
    readonly id: string;
    readonly createdAt: number;
    updatedAt: number;
    status: SessionState;
    closeReason?: string;
    metadata: Record<string, any>;
    readonly participantIds: Set<string>;

    registerParticipant(agentId: string): void;
    removeParticipant(agentId: string): boolean;
    hasParticipant(agentId: string): boolean;

    pushToInbox(agentId: string, block: DataBlock): void;
    popInbox(agentId: string): DataBlock[];
    peekInbox(agentId: string): ReadonlyArray<DataBlock>;
    hasPendingMessages(agentId: string): boolean;
    hasActionableMessages(agentId: string, forceWakeupThreshold?: number): boolean;
    getInboxSize(agentId: string): number;

    pause(): void;
    resume(): void;
    close(reason?: string): void;
    touch(): void;

    toJSON(): SessionData;
}

/**
 * 可選的會話持久化儲存庫介面
 */
export interface ISessionRepository {
    save(session: ISession): Promise<void>;
    load(sessionId: string): Promise<ISession | null>;
    delete(sessionId: string): Promise<boolean>;
    list(): Promise<string[]>;
    /** 批次載入儲存庫中所有會話實體 (用於重啟恢復) */
    loadAll?(): Promise<ISession[]>;
}

/**
 * 會話管理器配置選項
 */
export interface SessionManagerOptions {
    /** 注入事件總線，用於廣播會話生命週期事件 */
    eventBus?: EventBus;
    /** 可選持久化儲存庫 */
    repository?: ISessionRepository;
    /** 自動清理超時閒置會話之毫秒數 (0 代表不啟用自動超時) */
    autoCleanupIdleMs?: number;
}

/**
 * 會話管理器核心介面
 */
export interface ISessionManager {
    createSession(params?: SessionParams): ISession;
    getSession(sessionId: string): ISession | undefined;
    hasSession(sessionId: string): boolean;
    listSessions(): ISession[];
    getActiveSessions(): ISession[];
    closeSession(sessionId: string, reason?: string): boolean;
    pauseSession(sessionId: string): boolean;
    resumeSession(sessionId: string): boolean;
    removeSession(sessionId: string): boolean;
    saveSession(sessionId: string): Promise<void>;
    loadSession(sessionId: string): Promise<ISession>;
    cleanupExpiredSessions(maxIdleMs: number): number;
    recoverSessions?(): Promise<number>;
}
