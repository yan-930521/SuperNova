import { beforeEach, describe, expect, it } from 'bun:test';

import { AIMessage, HumanMessage } from '@langchain/core/messages';

import { LLMProvider, LLMSectionSchema, MockChatModel, MockEmbeddings } from '../';
import { Kernel } from '../../../../runtime/src/kernel/Kernel';
import { ConfigManager } from '../../config/ConfigManager';

describe('LLM 模組單元測試', () => {
    describe('MockChatModel', () => {
        it('應依先進先出順序返回佇列中的預設純文字回應', async () => {
            const mockModel = new MockChatModel();
            mockModel.queueResponse('First response');
            mockModel.queueResponse('Second response');

            const res1 = await mockModel.invoke([new HumanMessage('Hello 1')]);
            expect(res1.content).toBe('First response');

            const res2 = await mockModel.invoke([new HumanMessage('Hello 2')]);
            expect(res2.content).toBe('Second response');

            // 佇列空時應返回預設回應
            const res3 = await mockModel.invoke([new HumanMessage('Hello 3')]);
            expect(res3.content).toBe('Mock response');

            // 驗證呼叫歷史記錄
            const history = mockModel.getCallHistory();
            expect(history.length).toBe(3);
            expect(history[0][0].content).toBe('Hello 1');
            expect(history[1][0].content).toBe('Hello 2');
            expect(history[2][0].content).toBe('Hello 3');
        });

        it('應能模擬 Tool Calling 並攜帶 tool_calls 結構', async () => {
            const mockModel = new MockChatModel();
            mockModel.queueToolCall('calculator', { a: 10, b: 20 }, 'call_123');

            const result = await mockModel.invoke([new HumanMessage('Calculate 10 + 20')]);
            expect(result.tool_calls).toBeDefined();
            expect(result.tool_calls!.length).toBe(1);
            expect(result.tool_calls![0].name).toBe('calculator');
            expect(result.tool_calls![0].args).toEqual({ a: 10, b: 20 });
            expect(result.tool_calls![0].id).toBe('call_123');
        });

        it('應支援 bindTools 並保存綁定工具', async () => {
            const mockModel = new MockChatModel();
            const tools = [
                {
                    name: 'get_weather',
                    description: 'Get weather by city',
                    schema: {},
                },
            ];

            const bound = mockModel.bindTools(tools);
            expect(mockModel.boundTools).toEqual(tools);

            mockModel.queueResponse('Weather is sunny');
            const result = await bound.invoke([new HumanMessage('What is the weather?')]);
            expect(result.content).toBe('Weather is sunny');
        });
    });

    describe('MockEmbeddings', () => {
        it('應能產生指定維度的向量並記錄查詢歷史', async () => {
            const embeddings = new MockEmbeddings({ dimension: 512 });

            const vec = await embeddings.embedQuery('test text');
            expect(vec.length).toBe(512);
            expect(embeddings.queriedTexts).toContain('test text');

            const batch = await embeddings.embedDocuments(['text 1', 'text 2']);
            expect(batch.length).toBe(2);
            expect(batch[0].length).toBe(512);
            expect(batch[1].length).toBe(512);
        });
    });

    describe('LLMProvider 與生命週期整合', () => {
        let configManager: ConfigManager;

        beforeEach(async () => {
            configManager = new ConfigManager();
            configManager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'fast',
                embedding_model: 'mock-embed',
                embedding_provider: 'mock',
                presets: {
                    fast: {
                        provider: 'mock',
                        modelName: 'mock-fast-model',
                        temperature: 0.2,
                    },
                    creative: {
                        provider: 'mock',
                        modelName: 'mock-creative-model',
                        temperature: 0.9,
                    },
                },
            });
            await configManager.load();
        });

        it('initialize 應成功完成並能快取取得指定 Preset 的 Model', async () => {
            const provider = new LLMProvider(configManager);
            await provider.initialize();
            await provider.start();

            // 取得預設 fast 模型
            const model1 = provider.getModel();
            expect(model1).toBeDefined();

            // 再次獲取應返回同一個快取實例 (O(1))
            const model1Again = provider.getModel('fast');
            expect(model1Again).toBe(model1);

            // 取得 creative 模型
            const model2 = provider.getModel('creative');
            expect(model2).toBeDefined();
            expect(model2).not.toBe(model1);

            await provider.stop();
        });

        it('未定義的 Preset 應拋出明確錯誤', () => {
            const provider = new LLMProvider(configManager);
            expect(() => provider.getModel('non_existent')).toThrow(
                'LLM preset [non_existent] is not found in configuration'
            );
        });

        it('應能註冊並使用自訂模型工廠 (例如客製化 Provider)', async () => {
            const customConfig = new ConfigManager();
            customConfig.registerSection('llm', LLMSectionSchema, {
                default_preset: 'custom',
                embedding_model: 'mock-embed',
                embedding_provider: 'mock',
                presets: {
                    custom: {
                        provider: 'my-custom-llm',
                        modelName: 'custom-v1',
                        temperature: 0.5,
                    },
                },
            });
            await customConfig.load();

            const provider = new LLMProvider(customConfig);
            await provider.initialize();
            await provider.start();
            let customFactoryCalled = false;

            provider.registerModelFactory('my-custom-llm', (cfg) => {
                customFactoryCalled = true;
                return new MockChatModel({ defaultResponse: `Custom: ${cfg.modelName}` });
            });

            const model = provider.getModel('custom');
            expect(customFactoryCalled).toBe(true);
            expect(model).toBeDefined();

            await provider.stop();
        });

        it('能透過 Kernel 託管生命週期並獲取服務', async () => {
            const kernel = new Kernel();
            const provider = new LLMProvider(configManager);

            kernel.registerService('llm', provider);

            await kernel.boot();

            const retrievedProvider = kernel.getService<LLMProvider>('llm');
            expect(retrievedProvider).toBe(provider);

            const model = retrievedProvider.getModel();
            expect(model).toBeDefined();

            const embeddings = retrievedProvider.getEmbeddings();
            expect(embeddings).toBeInstanceOf(MockEmbeddings);

            await kernel.stop();
        });
    });
});
