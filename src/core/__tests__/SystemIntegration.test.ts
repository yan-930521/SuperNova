import { afterAll, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import { AgentManager } from '../agent/AgentManager';
import { AgentState, BaseAgent } from '../agent/BaseAgent';
import { Config } from '../config/Config';
import { IWorkspaceManager } from '../infra/persistence/IWorkspaceManager';
import { RuntimeKernel } from '../lifecycle/RuntimeKernel';
import { DataBlock } from '../messaging/DataBlock';
import { AgentEvent, IEventBus } from '../messaging/IBus';
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
            presets: {
                'FAST': { modelName: 'mock-model' }
            }
        },
        agent: {
            max_clones_per_agent: 2 // 嚴格限制分身上限為 2 供測試
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
            return "Mocked LLM Response";
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

    it('should handle sequential message correctly without clones', async () => {
        const sessionId = "seq-test-session";
        const mainAgentId = "SeqMainAgent";
        await sessionManager.createSession(mainAgentId, sessionId, 'PERSISTENT');
        
        let replyCount = 0;
        const handler = (e: any) => {
            if (e.payload.senderId === mainAgentId) {
                replyCount++;
            }
        };
        eventBus.subscribe(AgentEvent.AgentMessage, handler);

        const block = new DataBlock({
            sessionId,
            senderId: "User",
            targetId: mainAgentId,
            type: 'human',
            intent: 'TEST',
            controlPayload: 'Hello'
        });

        // 派發一則訊息
        await eventBus.publishAsync({
            type: AgentEvent.AgentMessage,
            timestamp: Date.now(),
            sessionId,
            payload: block
        });

        // 等待 LLM 模擬處理完成 (500ms + 緩衝)
        await new Promise(resolve => setTimeout(resolve, 800));

        // 應該沒有產生分身
        expect(agentManager.getActiveCloneCount(mainAgentId)).toBe(0);
        // 應該有收到一則回覆
        expect(replyCount).toBe(1);

        eventBus.unsubscribe(AgentEvent.AgentMessage, handler as any);
    });

    it('should spawn clones for concurrent requests up to max_clones_per_agent limit', async () => {
        const sessionId = "concurrent-session";
        const mainAgentId = "ConcurrentMainAgent";
        await sessionManager.createSession(mainAgentId, sessionId, 'PERSISTENT');
        
        const senders = ["User1", "User2", "User3", "User4"];
        
        // 為了避免測試框架的不穩定 setTimeout，我們直接 publishAsync 並等待它們全部完成
        // User1 到 User4 同時發送，系統應該會平行處理 (1 個 MainAgent + 2 個 Clone)，而最後 1 個會排隊等前面做完
        const promises = senders.map(senderId => {
            const block = new DataBlock({
                sessionId,
                senderId,
                targetId: mainAgentId,
                type: 'human',
                intent: 'TEST',
                controlPayload: `Concurrent Test from ${senderId}`
            });
            return eventBus.publishAsync({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId,
                payload: block
            });
        });

        // 我們等待所有的 publishAsync 完成 (包含重試與佇列消化)
        // 我們等待所有的 publishAsync 完成 (這只代表訊息已進入信箱或派發)
        await Promise.all(promises);

        // 由於第4個訊息會被退回 Inbox 排隊，它的執行是非同步的 (等待前三個有人 IDLE 才會自動觸發)
        // 為了確保整個排隊機制全部消化完畢，我們給予充分的時間等待 (大於 LLM mock 的 500ms 兩倍)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 所有的任務處理完畢後，Inbox 必定為空
        const session = sessionManager.getSession(sessionId);
        const finalPending = session!.getPendingSenders(mainAgentId);
        expect(finalPending.length).toBe(0);

        // 所有 Clone 也必定被 GC 銷毀
        expect(agentManager.getActiveCloneCount(mainAgentId)).toBe(0);
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
