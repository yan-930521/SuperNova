import { afterAll, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import { AgentManager } from '../agent/AgentManager';
import { AgentState, BaseAgent } from '../agent/BaseAgent';
import { Config } from '../config/Config';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { RuntimeKernel } from '../lifecycle/RuntimeKernel';
import { DataBlock } from '../messaging/DataBlock';
import { AgentEvent, IEventBus } from '../domain/IBus';
import { SessionState } from '../session';
import { SessionManager } from '../session/SessionManager';
import { IdGenerator } from '../utils/IdGenerator';

describe('System Integration & Inbox Dispatch Test', () => {
    let kernel: RuntimeKernel;
    let sessionManager: SessionManager;
    let agentManager: AgentManager;
    let eventBus: IEventBus;
    
    const testStorageDir = path.join(process.cwd(), '.dev_temp_system_test');
    
    const testConfig: Config = {
        version: "v0.1.0",
        cache: {
            prompt_lru_size: 100,
            memory_lru_size: 100
        },
        storage: {
            base_dir: '.dev_temp_system_test',
            session_dir: 'session',
            agent_dir: 'agents',
            agent_profile_dir: 'profiles',
            blob_dir: "blobs",
            session_file: 'session.json',
            history_file: 'history.jsonl',
            agent_state_file: 'state.json',
            oplog_file: '.oplog.jsonl'
        },
        security: {
            default_tool_timeout_ms: 3000,
            allow_tier_3_tools: false,
            max_safe_tokens: 100000
        },
        llm: {
            default_preset: 'FAST',
            embedding_model: 'mock-model',
            presets: {
                'FAST': { modelName: 'mock-model' }
            }
        },
        agent: {
            profile_version: 'v1',
            max_clones_per_agent: 3,
            force_wakeup_threshold: 1,
            save_tokens: true,
            uncompressed_tail: 3,
            max_context_window: 100000,
            enable_temporal_injection: true,
            enable_graph_memory: true,
            enable_daily_summary: true,
            enable_payload_offload: true,
            temporal_threshold_ms: 1000,
            offload_threshold_new_message: 5000,
            offload_threshold_compact: 10000,
            max_history_lines_safety_cap: 1000,
            memory_extract_threshold: 10,
            daily_optimization_time: '03:00',
            daily_optimization_check_interval_ms: 30000,
            daily_optimization_idle_threshold_ms: 60000,
            memory_episodic_days: 3,
            memory_graph_topk: 5,
            memory_graph_depth: 2
        },
        task: {
            force_mcts: false,
            mcts_max_iterations: 3
        }
    } as any;

    beforeAll(async () => {
        // 清理殘留目錄
        if (fs.existsSync(testStorageDir)) {
            fs.rmSync(testStorageDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testStorageDir, { recursive: true });

        // 啟動內核
        kernel = new RuntimeKernel(testConfig);
        await kernel.initialize();
        await kernel.start();

        const container = kernel.getContainer();
        sessionManager = container.resolve<SessionManager>('SessionManager');
        agentManager = container.resolve<AgentManager>('AgentManager');
        eventBus = container.resolve<IEventBus>('EventBus');

        // 強制攔截 BaseAgent 的 callModel，避免發送真實網路請求
        // 我們讓模擬的 LLM 延遲 500ms 後回覆，藉此測試併發與狀態鎖
        spyOn(BaseAgent.prototype as any, 'callModel').mockImplementation(async (messages: any[]) => {
            await new Promise(resolve => setTimeout(resolve, 500));
            return {
                newBlocks: [new DataBlock({
                    sessionId: 'dummy',
                    senderId: 'mock-agent',
                    type: 'ai',
                    intent: 'AGENT_REPLY',
                    controlPayload: 'Mocked LLM Response'
                })],
                usageDelta: { promptTokens: 10, completionTokens: 10, durationMs: 500 }
            };
        });
    });

    afterAll(async () => {
        try { await kernel.stop(); } catch (e) {}
        try {
            if (fs.existsSync(testStorageDir)) {
                fs.rmSync(testStorageDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn("Failed to cleanup test storage dir:", e);
        }
    });

    it('should create session and spawn MainAgent successfully', async () => {
        const sessionId = IdGenerator.session();
        const mainAgentId = IdGenerator.agent('main');

        const session = await sessionManager.createSession(mainAgentId, sessionId, 'PERSISTENT');
        expect(session).not.toBeNull();
        expect(session.id).toBe(sessionId);
        expect(session.registeredAgentIds.has(mainAgentId)).toBe(true);

        const agent = await agentManager.rehydrate(mainAgentId, sessionId);
        expect(agent).not.toBeNull();
        expect(agent.getState()).toBe(AgentState.IDLE);

        // 驗證 Workspace 實體目錄被正確建立
        const expectedWorkspacePath = path.join(
            process.cwd(),
            testConfig.storage.base_dir,
            testConfig.storage.session_dir,
            sessionId,
            testConfig.storage.agent_dir,
            mainAgentId
        );
        expect(fs.existsSync(expectedWorkspacePath)).toBe(true);

        // 驗證 Tools 工具包成功掛載
        const tools = (agent as any).tools || [];
        expect(tools.length).toBeGreaterThan(0); // 預設應該會掛載核心工具
        
        // 驗證 AgentProfile 大腦被成功載入
        const profile = agent.getProfile();
        expect(profile).not.toBeUndefined();
    });

    it('should correctly mount workspace and allow file operations', async () => {
        const sessionId = "workspace-test-session";
        const agentId = "WorkspaceAgent";
        await sessionManager.createSession(agentId, sessionId, 'PERSISTENT');

        const workspaceManager = kernel.getContainer().resolve<IWorkspaceManager>('WorkspaceManager');
        
        // 驗證寫入檔案
        await workspaceManager.writeFile(sessionId, agentId, 'test_file.txt', 'Hello SuperNova Workspace!');
        
        // 驗證讀取檔案
        const content = await workspaceManager.readFile(sessionId, agentId, 'test_file.txt');
        expect(content).toBe('Hello SuperNova Workspace!');

        // 驗證列表
        const files = await workspaceManager.listFiles(sessionId, agentId);
        expect(files.includes('test_file.txt')).toBe(true);
    });

    it('should recover session and agents from disk after graceful shutdown', async () => {
        // 第一階段：關閉當前 Kernel
        await kernel.stop();

        // 驗證持久化檔案是否存在
        const sessionFile = path.join(testStorageDir, 'session', 'workspace-test-session', 'session.json');
        expect(fs.existsSync(sessionFile)).toBe(true);

        // 第二階段：啟動全新 Kernel (模擬重啟)
        const newKernel = new RuntimeKernel(testConfig);
        await newKernel.initialize();
        await newKernel.start();

        const newSessionManager = newKernel.getContainer().resolve<SessionManager>('SessionManager');
        
        // 系統應該自動將 PERSISTENT 會話重新掛載回 ACTIVE
        const recoveredSession = newSessionManager.getSession("workspace-test-session");
        expect(recoveredSession).not.toBeNull();
        expect(recoveredSession!.status).toBe(SessionState.ACTIVE);

        // 清理
        await newKernel.stop();
    });
});
