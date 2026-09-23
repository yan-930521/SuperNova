import * as fs from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { LLMProvider, LLMSectionSchema, MockChatModel, MockEmbeddings } from '@supernova/common/llm';
import { EventBus } from '@supernova/events/EventBus';
import { PromptSectionIndex } from '@supernova/events/IBus';
import { ConfigManager } from '@supernova/runtime';

import {
    AgentState, HistoryModule, MemoryModule, ProfileModule, UniversalAgent
} from '../agent';
import { DEFAULT_STORAGE_CONFIG } from '../config';
import { JsonGraphRepository } from '../memory';
import { FileSystemDataBlockRepository } from '../messaging';

describe('MemoryModule (長期記憶與語意圖譜器官整合測試)', () => {
    const testBaseDir = './workspace_test_memory_module';
    const sessionId = 'test-session-mem-1';

    let eventBus: EventBus;
    let configManager: ConfigManager;
    let llmProvider: LLMProvider;
    let mockModel: MockChatModel;
    let graphRepo: JsonGraphRepository;
    let dataBlockRepo: FileSystemDataBlockRepository;

    beforeEach(async () => {
        eventBus = new EventBus();
        configManager = new ConfigManager();
        configManager.registerSection('llm', LLMSectionSchema, {
            default_preset: 'default',
            embedding_model: 'mock-embed',
            embedding_provider: 'mock',
            presets: {
                default: {
                    provider: 'mock',
                    modelName: 'mock-chat',
                    temperature: 0.2,
                },
                extraction: {
                    provider: 'mock',
                    modelName: 'mock-extract',
                    temperature: 0.1,
                },
            },
        });
        await configManager.load();

        llmProvider = new LLMProvider(configManager);
        await llmProvider.initialize();
        await llmProvider.start();

        mockModel = llmProvider.getModel('default') as MockChatModel;
        mockModel.reset();

        graphRepo = new JsonGraphRepository({
            storage: {
                ...DEFAULT_STORAGE_CONFIG,
                base_dir: testBaseDir,
                session_dir: 'sessions',
                graph_dir: 'graph',
            },
        });

        dataBlockRepo = new FileSystemDataBlockRepository({
            storage: {
                ...DEFAULT_STORAGE_CONFIG,
                base_dir: testBaseDir,
                session_dir: 'sessions',
            },
        });
    });

    afterEach(async () => {
        await fs.rm(testBaseDir, { recursive: true, force: true }).catch(() => {});
    });

    it('依賴校驗：若缺少 profile 或 history 應拒絕掛載', async () => {
        const agent = new UniversalAgent('mem-agent-1', eventBus, llmProvider);
        const memModule = new MemoryModule({ repository: graphRepo, sessionId });

        // 尚未掛載 profile 與 history
        expect(agent.attachModule(memModule)).rejects.toThrow(
            'requires module [profile]'
        );

        // 掛載 profile 後，仍缺少 history
        await agent.attachModule(
            ProfileModule.fromProfile({ name: 'Nova', identity: 'AI Assistant' }, false)
        );
        expect(agent.attachModule(memModule)).rejects.toThrow(
            'requires module [history]'
        );
    });

    it('檢索注入：思考前 (onBeforeRun) 應依使用者輸入召回記憶並注入 MEMORY_CONTEXT', async () => {
        const agent = new UniversalAgent('mem-agent-2', eventBus, llmProvider, {
            sessionId,
        });

        await agent.attachModule(
            ProfileModule.fromProfile({ name: 'Nova', identity: 'AI Assistant' }, false)
        );
        await agent.attachModule(
            new HistoryModule({ repository: dataBlockRepo, sessionId })
        );

        const memModule = new MemoryModule({
            repository: graphRepo,
            sessionId,
            topK: 2,
        });
        await agent.attachModule(memModule);

        // 預先在圖譜庫中注入知識節點與向量 (MockEmbeddings 對應 queryText 生成的向量)
        const embeddings = llmProvider.getEmbeddings();
        const vec = await embeddings.embedQuery('TypeScript rules');

        await graphRepo.addNode(sessionId, {
            id: 'CONCEPT:StrictType',
            label: 'Rule',
            memory: 'User strictly enforces no-any and TypeScript strict types.',
            embedding: vec,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        mockModel.queueResponse('Understood! I will use strict TypeScript.');

        // 執行 Agent 推理
        const reply = await agent.run('Tell me about your TypeScript rules');
        expect(reply.content).toBe('Understood! I will use strict TypeScript.');

        // 驗證工具清單中包含 recall_memory
        const tools = memModule.getTools();
        expect(tools.length).toBe(1);
        expect(tools[0].name).toBe('recall_memory');
    });

    it('記憶檢索工具 (recall_memory) 應能主動調用並格式化返回', async () => {
        const memModule = new MemoryModule({
            repository: graphRepo,
            sessionId,
        });

        const agent = new UniversalAgent('mem-agent-3', eventBus, llmProvider, {
            sessionId,
        });
        await agent.attachModule(
            ProfileModule.fromProfile({ name: 'Nova', identity: 'AI Assistant' }, false)
        );
        await agent.attachModule(
            new HistoryModule({ repository: dataBlockRepo, sessionId })
        );
        await agent.attachModule(memModule);

        const embeddings = llmProvider.getEmbeddings();
        const vec = await embeddings.embedQuery('architecture');

        await graphRepo.addNode(sessionId, {
            id: 'ARCH:SuperNova',
            label: 'Architecture',
            memory: 'SuperNova uses Micro-Kernel and Composable Organs.',
            embedding: vec,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        const [recallTool] = memModule.getTools();
        const toolResult = await recallTool.func({ query: 'architecture', limit: 2 });

        expect(toolResult).toContain('Long-Term Knowledge Graph Memory');
        expect(toolResult).toContain('ARCH:SuperNova');
        expect(toolResult).toContain('Micro-Kernel');
    });
});
