import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

import { LLMProvider, LLMSectionSchema, MockChatModel } from '@supernova/common/llm';
import { EventBus } from '@supernova/events/EventBus';
import {
    AgentEvent, HookEvent, PromptSectionIndex, SessionEvent, SessionMessageType
} from '@supernova/events/IBus';
import { ConfigManager, Kernel } from '@supernova/runtime';

import {
    AgentManager, AgentState, FileSystemProfileRepository, HistoryModule, IAgentContext,
    IAgentModule, ProfileModule, RunContext, UniversalAgent
} from '../agent';

describe('UniversalAgent & EventBus 整合單元測試', () => {
    let eventBus: EventBus;
    let configManager: ConfigManager;
    let llmProvider: LLMProvider;
    let mockModel: MockChatModel;

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

        // 取得 LLMProvider 產生的 MockChatModel
        mockModel = llmProvider.getModel('mock_preset') as MockChatModel;
        mockModel.reset();
    });

    describe('模組 (器官) 插拔與依賴校驗', () => {
        it('掛載模組應觸發 onAttach，卸載應觸發 onDetach', async () => {
            const agent = new UniversalAgent('agent-01', eventBus, llmProvider, {
                presetName: 'mock_preset',
            });

            let attached = false;
            let detached = false;

            const dummyModule: IAgentModule = {
                name: 'test_module',
                priority: 10,
                onAttach: (ctx: IAgentContext) => {
                    attached = true;
                    expect(ctx.agentId).toBe('agent-01');
                    expect(ctx.eventBus).toBe(eventBus);
                },
                onDetach: () => {
                    detached = true;
                },
            };

            await agent.attachModule(dummyModule);
            expect(attached).toBe(true);
            expect(agent.hasModule('test_module')).toBe(true);

            await agent.detachModule('test_module');
            expect(detached).toBe(true);
            expect(agent.hasModule('test_module')).toBe(false);
        });

        it('前置依賴 (requires) 未滿足時應阻止掛載並拋出例外', async () => {
            const agent = new UniversalAgent('agent-02', eventBus, llmProvider);

            const dependentModule: IAgentModule = {
                name: 'module_b',
                priority: 20,
                requires: ['module_a'],
                onAttach: () => {},
                onDetach: () => {},
            };

            expect(agent.attachModule(dependentModule)).rejects.toThrow(
                'Module [module_b] requires module [module_a], which is not attached'
            );
        });

        it('互斥衝突 (conflicts) 時應阻止掛載並拋出例外', async () => {
            const agent = new UniversalAgent('agent-03', eventBus, llmProvider);

            const moduleA: IAgentModule = {
                name: 'module_a',
                priority: 10,
                onAttach: () => {},
                onDetach: () => {},
            };

            const conflictingModule: IAgentModule = {
                name: 'module_b',
                priority: 20,
                conflicts: ['module_a'],
                onAttach: () => {},
                onDetach: () => {},
            };

            await agent.attachModule(moduleA);
            expect(agent.attachModule(conflictingModule)).rejects.toThrow(
                'Module [module_b] conflicts with already attached module [module_a]'
            );
        });
    });

    describe('ReAct 思考循環與 EventBus 切面監控', () => {
        it('單純文字回答：應正確廣播狀態遷移、步驟切面與 AgentMessage 事件', async () => {
            const agent = new UniversalAgent('chat-agent', eventBus, llmProvider, {
                presetName: 'mock_preset',
            });

            // 監聽各關鍵事件
            const stateEvents: any[] = [];
            const stepEvents: string[] = [];
            let capturedMessage: any;

            eventBus.subscribe(AgentEvent.AgentStateChanged, (e) => {
                stateEvents.push(e.payload);
            });
            eventBus.subscribe(HookEvent.BeforeAgentRun, () => {
                stepEvents.push('before_run');
            });
            eventBus.subscribe(HookEvent.AfterAgentRun, () => {
                stepEvents.push('after_run');
            });
            eventBus.subscribe(SessionEvent.SessionMessage, (e) => {
                capturedMessage = e.payload;
            });

            // 注入測試模組提供 Prompt 段落
            const promptModule: IAgentModule = {
                name: 'identity_module',
                priority: 10,
                onAttach: () => {},
                onDetach: () => {},
                getPromptSections: () => [
                    {
                        index: PromptSectionIndex.SYSTEM_CORE,
                        content: 'You are SuperNova Core Assistant.',
                    },
                ],
            };
            await agent.attachModule(promptModule);

            mockModel.queueResponse('Hello! How can I help you today?');

            const response = await agent.run('Hello!');
            expect(response.content).toBe('Hello! How can I help you today?');

            // 等待 setImmediate 確保 EventBus 非同步廣播觸發完成
            await new Promise(r => setTimeout(r, 15));

            // 驗證狀態遷移 (IDLE -> BUSY -> IDLE)
            const transitions = stateEvents.map(s => `${s.oldState}->${s.newState}`);
            expect(transitions).toContain('IDLE->BUSY');
            expect(transitions).toContain('BUSY->IDLE');

            // 驗證執行週期切面
            expect(stepEvents).toEqual(['before_run', 'after_run']);

            // 驗證 System Prompt 有被組合
            const lastCall = mockModel.getLastCall();
            expect(lastCall).toBeDefined();
            expect(lastCall![0]._getType()).toBe('system');
            expect(lastCall![0].content).toContain('You are SuperNova Core Assistant.');
            expect(lastCall![1].content).toBe('Hello!');

            expect(capturedMessage).toBeDefined();
            expect(capturedMessage.type).toBe(SessionMessageType.AgentSend);
            expect(Array.isArray(capturedMessage.message)).toBe(true);
            expect(capturedMessage.message[0].controlPayload).toBe('Hello! How can I help you today?');
        });

        it('Tool Calling 循環：觸發工具調用時應廣播 Before/AfterToolCall 並完成二次思考', async () => {
            const agent = new UniversalAgent('tool-agent', eventBus, llmProvider, {
                presetName: 'mock_preset',
            });

            const toolEvents: string[] = [];
            eventBus.subscribe(HookEvent.BeforeToolCall, (e) => {
                toolEvents.push(`before:${e.payload.toolName}`);
            });
            eventBus.subscribe(HookEvent.AfterToolCall, (e) => {
                toolEvents.push(`after:${e.payload.toolName}`);
            });

            // 模組提供工具
            const calculatorTool = {
                name: 'add_numbers',
                description: 'Add two numbers',
                invoke: async ({ a, b }: { a: number; b: number }) => a + b,
            };

            const mathModule: IAgentModule = {
                name: 'math_module',
                priority: 10,
                onAttach: () => {},
                onDetach: () => {},
                getTools: () => [calculatorTool],
            };
            await agent.attachModule(mathModule);

            // 第一回合：模型決定調用工具
            mockModel.queueToolCall('add_numbers', { a: 15, b: 25 }, 'call_math_1');
            // 第二回合：模型根據工具回傳的 40 給出最終答案
            mockModel.queueResponse('The sum of 15 and 25 is 40.');

            const finalResponse = await agent.run('Calculate 15 + 25');
            expect(finalResponse.content).toBe('The sum of 15 and 25 is 40.');

            // 等待 setImmediate 確保 EventBus 非同步廣播觸發完成
            await new Promise(r => setTimeout(r, 15));

            // 驗證工具切面事件
            expect(toolEvents).toEqual(['before:add_numbers', 'after:add_numbers']);

            // 驗證歷史調用次數為 2 (Tool Call -> Final Answer)
            const history = mockModel.getCallHistory();
            expect(history.length).toBe(2);
        });

        it('工具執行報錯時應觸發 HookEvent.OnToolError 並向模型反饋錯誤訊息', async () => {
            const agent = new UniversalAgent('error-tool-agent', eventBus, llmProvider, {
                presetName: 'mock_preset',
            });

            let errorCaptured = false;
            eventBus.subscribe(HookEvent.OnToolError, (e) => {
                errorCaptured = true;
                expect(e.payload.toolName).toBe('failing_tool');
            });

            const failingModule: IAgentModule = {
                name: 'failing_module',
                priority: 10,
                onAttach: () => {},
                onDetach: () => {},
                getTools: () => [
                    {
                        name: 'failing_tool',
                        invoke: async () => {
                            throw new Error('Database connection failed');
                        },
                    },
                ],
            };
            await agent.attachModule(failingModule);

            // 第一回合：調用會失敗的工具
            mockModel.queueToolCall('failing_tool', {}, 'call_fail');
            // 第二回合：模型針對錯誤回應
            mockModel.queueResponse('I encountered an error connecting to the database.');

            const res = await agent.run('Do operation');
            expect(res.content).toBe('I encountered an error connecting to the database.');

            // 等待 setImmediate 確保 EventBus 非同步廣播觸發完成
            await new Promise(r => setTimeout(r, 15));
            expect(errorCaptured).toBe(true);
        });
    });

    describe('AgentManager 與 Kernel 集中託管', () => {
        it('AgentManager 應能由 Kernel 自動注入相依服務並託管 Agent 生命週期', async () => {
            const kernel = new Kernel();
            kernel.registerService('events', eventBus);
            kernel.registerService('llm', llmProvider);
            kernel.registerService('config', configManager);

            const agentPlugin = new AgentManager();
            await kernel.use(agentPlugin);

            await kernel.boot();

            // 從 Kernel 取得託管的 agent_manager
            const agentManager = kernel.getService<AgentManager>(agentPlugin.name);
            expect(agentManager).toBe(agentPlugin);

            // 建立受託管之 Agent
            const agent = agentManager.createAgent('managed-agent-1', {
                presetName: 'mock_preset',
            });
            expect(agent).toBeDefined();
            expect(agentManager.getAgent('managed-agent-1')).toBe(agent);

            // 測試運行
            mockModel.queueResponse('Managed agent is running perfectly!');
            const result = await agent.run('Status check');
            expect(result.content).toBe('Managed agent is running perfectly!');

            // Kernel 停機應連帶停機託管之 Agent
            await kernel.stop();
            expect(agent.state).toBe(AgentState.STOPPED);
        });

        it('ProfileModule 掛載時應自動將自身資料落盤至 sessions/{sessionId}/agents/{agentId}/profile.json', async () => {
            const testBaseDir = './workspace_test_profile';
            const sessionId = 'test-ssn-profile-99';
            const agentId = 'test-agent-sandbox';

            const agent = new UniversalAgent(agentId, eventBus, llmProvider, {
                sessionId,
            });

            // 外部建立單例 Repository (繼承 BaseJsonRepository)
            const profileRepo = new FileSystemProfileRepository({
                storage: {
                    base_dir: testBaseDir,
                    session_dir: 'sessions',
                    agent_dir: 'agents',
                    blob_dir: 'blobs',
                    summary_dir: 'summaries',
                    history_file: 'history.jsonl',
                    profile_dir: 'profiles',
                    profile_version: 'v1',
                    graph_dir: 'graph',
                    graph_nodes_file: 'nodes.json',
                    graph_edges_file: 'edges.json'
                },
            });

            const profileModule = ProfileModule.fromProfile(
                {
                    name: 'TestSandboxAgent',
                    identity: 'An agent with sandbox profile',
                    mission: 'Test isolation',
                },
                true,
                {
                    repository: profileRepo,
                }
            );

            await agent.attachModule(profileModule);

            const expectedPath = path.join(
                testBaseDir,
                'sessions',
                sessionId,
                'agents',
                agentId,

                'profile.json'
            );

            // 檢查檔案是否存在並讀取驗證內容
            const exists = await fs.stat(expectedPath).then(() => true).catch(() => false);
            expect(exists).toBe(true);

            const content = JSON.parse(await fs.readFile(expectedPath, 'utf-8'));
            expect(content.name).toBe('TestSandboxAgent');
            expect(content.mission).toBe('Test isolation');

            // 清理測試資料夾
            await fs.rm(testBaseDir, { recursive: true, force: true });
        });
    });
});

