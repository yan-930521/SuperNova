import { describe, expect, it } from 'bun:test';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { PromptSectionIndex } from '@supernova/events/IBus';
import { EventBus } from '@supernova/events';
import { LLMProvider, LLMSectionSchema } from '@supernova/common/llm';
import { ConfigManager } from '@supernova/runtime';

import { HistoryModule } from '../agent/modules';
import { UniversalAgent } from '../agent/UniversalAgent';
import { DataBlock, MessagePriority } from '../messaging';

describe('HistoryModule Unit Tests', () => {
    it('應具備標準器官規格 (name=history, priority=10)', () => {
        const mod = new HistoryModule();
        expect(mod.name).toBe('history');
        expect(mod.priority).toBe(10);
        expect(mod.size).toBe(0);
    });

    it('應能正確 append HumanMessage, AIMessage 與 DataBlock', () => {
        const mod = new HistoryModule();

        const humanMsg = new HumanMessage('Hello');
        const aiMsg = new AIMessage('Hi there');
        const block = new DataBlock({
            sessionId: 'sess_1',
            senderId: 'user_42',
            type: 'human',
            controlPayload: 'DataBlock content',
        });

        mod.append(humanMsg);
        mod.append(aiMsg);
        mod.append(block);

        expect(mod.size).toBe(3);
        const messages = mod.getMessages();
        expect(messages[0].content).toBe('Hello');
        expect(messages[1].content).toBe('Hi there');
        expect(messages[2].content).toContain('DataBlock content');
    });

    it('滑動窗口 (maxMessages) 應能正確淘汰最舊的對話', () => {
        const mod = new HistoryModule({ maxMessages: 3 });

        mod.append(new HumanMessage('Msg 1'));
        mod.append(new HumanMessage('Msg 2'));
        mod.append(new HumanMessage('Msg 3'));
        expect(mod.size).toBe(3);

        mod.append(new HumanMessage('Msg 4'));
        expect(mod.size).toBe(3);

        const msgs = mod.getMessages();
        expect(msgs[0].content).toBe('Msg 2');
        expect(msgs[1].content).toBe('Msg 3');
        expect(msgs[2].content).toBe('Msg 4');
    });

    it('應能透過 getPromptSections 注入 MEMORY_CONTEXT', () => {
        const mod = new HistoryModule({
            summaryPrompt: '使用者偏好使用 TypeScript 進行簡潔的架構設計。',
        });

        const sections = mod.getPromptSections();
        expect(sections.length).toBe(1);
        expect(sections[0].index).toBe(PromptSectionIndex.MEMORY_CONTEXT);
        expect(sections[0].content).toContain('TypeScript');
    });

    it('時間感知插針：訊息間隔超過門檻應自動注入系統時間提示', () => {
        const mod = new HistoryModule({
            enableTemporalInjection: true,
            temporalThresholdMs: 300_000, // 5 分鐘
        });

        const baseTime = 1700000000000;
        const block1 = new DataBlock({
            sessionId: 's1',
            senderId: 'user',
            type: 'human',
            controlPayload: 'Message at 10:00',
            timestamp: baseTime,
        });

        // 間隔 2 小時 (7,200,000 ms)
        const block2 = new DataBlock({
            sessionId: 's1',
            senderId: 'user',
            type: 'human',
            controlPayload: 'Message at 12:00',
            timestamp: baseTime + 7_200_000,
        });

        mod.append(block1);
        mod.append(block2);

        const messages = mod.getMessages();
        // 應包含：block1 + 時間插針 + block2，總共 3 則
        expect(messages.length).toBe(3);
        expect(messages[0].content).toContain('Message at 10:00');
        expect(messages[1] instanceof SystemMessage).toBe(true);
        expect(messages[1].content).toContain('距離上一次對話已過 2 小時');
        expect(messages[2].content).toContain('Message at 12:00');
    });

    it('增量快取：重覆讀取應直接命中快取', () => {
        const mod = new HistoryModule();
        const block = new DataBlock({
            sessionId: 's1',
            senderId: 'user',
            type: 'human',
            controlPayload: 'Test Caching',
        });
        mod.append(block);

        const read1 = mod.getMessages();
        const read2 = mod.getMessages();
        expect(read1).toEqual(read2);
    });

    it('應能與 UniversalAgent 完美協同，自動注入歷史與收集模型輸出', async () => {
        const eventBus = new EventBus();
        const configManager = new ConfigManager();
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

        const llmProvider = new LLMProvider(configManager);
        await llmProvider.initialize();
        await llmProvider.start();

        const agent = new UniversalAgent('agent_history_tester', eventBus, llmProvider, {
            presetName: 'mock_preset',
        });
        const historyMod = new HistoryModule({ maxMessages: 10 });
        await agent.attachModule(historyMod);

        // 第一輪對話
        const input1 = new HumanMessage('這是第一輪提問');
        await agent.run([input1]);

        // 歷史中應包含提問與模型回答 (Mock 輸出)
        expect(historyMod.size).toBeGreaterThanOrEqual(2);
        const round1Msgs = historyMod.getMessages();
        expect(round1Msgs[0].content).toContain('這是第一輪提問');
        expect(round1Msgs[1] instanceof AIMessage).toBe(true);

        // 第二輪對話
        const input2 = new HumanMessage('這是第二輪提問');
        await agent.run([input2]);

        // 歷史應累積到 4 則
        expect(historyMod.size).toBeGreaterThanOrEqual(4);
        const round2Msgs = historyMod.getMessages();
        expect(round2Msgs[2].content).toContain('這是第二輪提問');
        expect(round2Msgs[3] instanceof AIMessage).toBe(true);
    });
});
