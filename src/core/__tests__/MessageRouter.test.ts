import { beforeEach, describe, expect, it } from 'bun:test';

import { AIMessage } from '@langchain/core/messages';
import { LLMProvider, LLMSectionSchema, MockChatModel } from '@supernova/common/llm';
import { EventBus } from '@supernova/events/EventBus';
import { AgentEvent, SessionEvent, SessionMessageType } from '@supernova/events/IBus';
import { ConfigManager, Kernel } from '@supernova/runtime';

import { AgentManager, AgentState, UniversalAgent } from '../agent';
import { DataBlock, MessagePriority, MessageRouter } from '../messaging';
import { SessionManager } from '../session';

describe('MessageRouter 訊息路由器測試', () => {
    let eventBus: EventBus;
    let configManager: ConfigManager;
    let llmProvider: LLMProvider;
    let mockModel: MockChatModel;
    let sessionManager: SessionManager;
    let agentManager: AgentManager;
    let router: MessageRouter;

    beforeEach(async () => {
        eventBus = new EventBus();
        configManager = new ConfigManager();
        configManager.registerSection('llm', LLMSectionSchema, {
            default_preset: 'mock_preset',
            embedding_model: 'mock-embed',
            embedding_provider: 'mock',
            presets: {
                mock_preset: {
                    provider: 'mock',
                    modelName: 'mock-v1',
                    temperature: 0.1,
                },
            },
        });
        await configManager.load();

        llmProvider = new LLMProvider(configManager);
        await llmProvider.initialize();
        await llmProvider.start();

        mockModel = llmProvider.getModel('mock_preset') as MockChatModel;
        mockModel.reset();

        sessionManager = new SessionManager({ eventBus });
        agentManager = new AgentManager();

        // 模擬 AgentManager 依賴注入
        const mockKernel = {
            hasService: (name: string) => true,
            getService: (name: string) => {
                if (name === 'events') return eventBus;
                if (name === 'llm') return llmProvider;
                if (name === 'config') return configManager;
                return undefined;
            },
            registerService: () => {},
        } as any;

        await agentManager.install(mockKernel);
        await agentManager.initialize();

        router = new MessageRouter({
            eventBus,
            sessionManager,
            agentManager,
            forceWakeupThreshold: 5,
        });
        await router.initialize();
        await router.start();
    });

    it('單播模式：HIGH 優先度訊息應即刻喚醒目標 Agent 進行思考', async () => {
        const session = sessionManager.createSession();
        const agent = agentManager.createAgent('agent_worker', { presetName: 'mock_preset' });
        session.registerParticipant('agent_worker');

        mockModel.queueResponse(new AIMessage('Task accepted and processed.'));

        const block = new DataBlock({
            sessionId: session.id,
            senderId: 'user',
            targetId: 'agent_worker',
            controlPayload: 'Urgent task to execute',
            priority: MessagePriority.HIGH,
        });

        await router.route(block);

        // 等待 Agent 執行與 Promise 結算
        await new Promise((r) => setTimeout(r, 30));

        // 驗證訊息已自收件箱取出處理完畢
        expect(session.getInboxSize('agent_worker')).toBe(0);
        expect(agent.state).toBe(AgentState.IDLE);
    });

    it('門檻控制：NORMAL 訊息累積達門檻時觸發批次喚醒', async () => {
        const session = sessionManager.createSession();
        const agent = agentManager.createAgent('agent_batch', { presetName: 'mock_preset' });
        session.registerParticipant('agent_batch');

        mockModel.queueResponse(new AIMessage('All 5 batch messages processed.'));

        // 發送 4 筆 NORMAL 訊息 (小於門檻 5)
        for (let i = 1; i <= 4; i++) {
            await router.route(
                new DataBlock({
                    sessionId: session.id,
                    senderId: 'user',
                    targetId: 'agent_batch',
                    controlPayload: `Notice ${i}`,
                    priority: MessagePriority.NORMAL,
                })
            );
        }

        // 應保留在收件箱中，不喚醒
        expect(session.getInboxSize('agent_batch')).toBe(4);

        // 發送第 5 筆訊息，達到門檻
        await router.route(
            new DataBlock({
                sessionId: session.id,
                senderId: 'user',
                targetId: 'agent_batch',
                controlPayload: 'Notice 5',
                priority: MessagePriority.NORMAL,
            })
        );

        await new Promise((r) => setTimeout(r, 30));

        // 5 筆訊息應一次性被提取處理完畢
        expect(session.getInboxSize('agent_batch')).toBe(0);
    });

    it('忙碌排隊與自動喚醒：Agent 處於 BUSY 時暫存 Inbox，回到 IDLE 時自動補發', async () => {
        const session = sessionManager.createSession();
        const agent = agentManager.createAgent('agent_busy', { presetName: 'mock_preset' });
        session.registerParticipant('agent_busy');

        // 模擬 Agent 正在執行其他任務 (BUSY 狀態)
        (agent as any)._state = AgentState.BUSY;

        mockModel.queueResponse(new AIMessage('Queued message handled after busy state.'));

        const block = new DataBlock({
            sessionId: session.id,
            senderId: 'user',
            targetId: 'agent_busy',
            controlPayload: 'Important task sent during busy',
            priority: MessagePriority.HIGH,
        });

        // 路由發送：因 BUSY 狀態，不立即 dispatch
        await router.route(block);
        expect(session.getInboxSize('agent_busy')).toBe(1);

        // 模擬 Agent 前一個任務完成，轉回 IDLE 並廣播狀態變更事件
        (agent as any)._state = AgentState.IDLE;
        eventBus.publish({
            type: AgentEvent.AgentStateChanged,
            timestamp: Date.now(),
            payload: {
                agentId: 'agent_busy',
                oldState: AgentState.BUSY,
                newState: AgentState.IDLE,
            },
        });

        // 等待非同步事件處理與補發完成
        await new Promise((r) => setTimeout(r, 40));

        // 驗證排隊訊息已成功派發並處理
        expect(session.getInboxSize('agent_busy')).toBe(0);
        expect(agent.state).toBe(AgentState.IDLE);
    });

    it('廣播模式：targetId 為 * 時應投遞給會話內所有其他成員並喚醒', async () => {
        const session = sessionManager.createSession();
        const agent1 = agentManager.createAgent('agent_1', { presetName: 'mock_preset' });
        const agent2 = agentManager.createAgent('agent_2', { presetName: 'mock_preset' });
        session.registerParticipant('agent_1');
        session.registerParticipant('agent_2');

        mockModel.queueResponse(new AIMessage('Agent 1 received broadcast'));
        mockModel.queueResponse(new AIMessage('Agent 2 received broadcast'));

        const broadcastBlock = new DataBlock({
            sessionId: session.id,
            senderId: 'system_admin',
            targetId: '*',
            controlPayload: 'Broadcast notification to all',
            priority: MessagePriority.HIGH,
        });

        await router.route(broadcastBlock);
        await new Promise((r) => setTimeout(r, 40));

        expect(session.getInboxSize('agent_1')).toBe(0);
        expect(session.getInboxSize('agent_2')).toBe(0);
    });

    it('微核心插件整合：應能透過 Kernel 優雅引導與停機', async () => {
        const kernel = new Kernel();
        kernel.registerService('config', configManager);
        kernel.registerService('events', eventBus);
        kernel.registerService('llm', llmProvider);

        const sm = new SessionManager({ eventBus });
        const am = new AgentManager();
        const mr = new MessageRouter();

        await kernel.use(sm);
        await kernel.use(am);
        await kernel.use(mr);

        await kernel.boot();

        expect(kernel.hasService(mr.name)).toBe(true);
        expect(kernel.getService<MessageRouter>(mr.name)).toBe(mr);

        await kernel.stop();
    });

    it('全場域協同：外部透過 SessionEvent.SessionMessage 發佈訊息，應自動派發並喚醒目標 Agent', async () => {
        const session = sessionManager.createSession();
        const agent = agentManager.createAgent('agent_echo', { presetName: 'mock_preset' });
        session.registerParticipant('agent_echo');

        mockModel.queueResponse(new AIMessage('User command processed.'));

        const userBlock = new DataBlock({
            sessionId: session.id,
            senderId: 'user_alice',
            targetId: 'agent_echo',
            type: 'human',
            intent: 'USER_COMMAND',
            controlPayload: 'Build the bridge across the river',
            priority: MessagePriority.HIGH,
        });

        // 透過 EventBus 發佈 SessionMessage (代表使用者輸入)
        eventBus.publish({
            type: SessionEvent.SessionMessage,
            timestamp: Date.now(),
            sessionId: session.id,
            payload: {
                sessionId: session.id,
                senderId: 'user_alice',
                targetId: 'agent_echo',
                type: SessionMessageType.UserInput,
                intent: 'USER_COMMAND',
                message: [userBlock],
            },
        });

        await new Promise((r) => setTimeout(r, 40));

        expect(session.getInboxSize('agent_echo')).toBe(0);
        expect(agent.state).toBe(AgentState.IDLE);
    });
});
