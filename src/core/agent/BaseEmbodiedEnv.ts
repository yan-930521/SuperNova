import { ILifecycle } from '../lifecycle/ILifecycle';
import { BaseTool } from '../tools/BaseTool';
import { IEventBus } from '../domain/IBus';
import { SkillManager } from '../skill/SkillManager';
import { ICodeSkillRepository } from '../domain/ICodeSkillRepository';

export interface AgentContext {
    sessionId: string;
    stateRegistry: any;
}

export abstract class BaseEmbodiedEnv implements ILifecycle {
    /**
     * 系統事件匯流排
     */
    protected eventBus!: IEventBus;

    /**
     * 技能程式碼儲存庫
     */
    protected codeSkillRepo!: ICodeSkillRepository;

    /**
     * 環境專屬的技能執行引擎
     */
    protected skillManager!: SkillManager;

    /**
     * 取得環境專屬的技能管理器
     */
    public getSkillManager(): SkillManager {
        return this.skillManager;
    }

    /**
     * 環境的唯一識別名稱，例如 'minecraft-underworld' 或 'chrome-browser'
     */
    public abstract readonly envId: string;

    /**
     * 已註冊（登入）到此環境的 Agent 列表
     * Key: agentId
     */
    protected registeredAgents: Map<string, AgentContext> = new Map();

    /**
     * 將特定代理人綁定（登入）到此環境
     */
    public async registerAgent(agentId: string, sessionId: string, stateRegistry: any): Promise<void> {
        this.registeredAgents.set(agentId, { sessionId, stateRegistry });
    }

    /**
     * 將特定代理人解除綁定（登出）此環境
     */
    public async unregisterAgent(agentId: string): Promise<void> {
        this.registeredAgents.delete(agentId);
    }

    /**
     * 初始化環境，例如連線、啟動管理器等 (ILifecycle)
     */
    public abstract initialize(): Promise<void>;

    /**
     * 啟動環境的背景感知與業務邏輯 (ILifecycle)
     */
    public abstract start(): Promise<void>;

    /**
     * 停止背景感知與清理資源 (ILifecycle)
     */
    public abstract stop(): Promise<void>;

    /**
     * 取得給 LLM 看的 SDK 宣告 (TypeScript 定義檔)
     */
    public abstract getSdkDeclaration(): string;

    /**
     * 取得這個環境專屬的工具清單
     * 這些工具會在掛載時註冊到 Agent 身上
     */
    public abstract getTools(): BaseTool[];
}
