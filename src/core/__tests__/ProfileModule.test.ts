import { describe, expect, it } from 'bun:test';
import * as path from 'path';

import { AIMessage } from '@langchain/core/messages';
import { LLMProvider, LLMSectionSchema } from '@supernova/common/llm';
import { EventBus } from '@supernova/events';
import { PromptSectionIndex } from '@supernova/events/IBus';
import { ConfigManager } from '@supernova/runtime';

import {
    AgentProfile, ProfileModule, PromptLoader, SYSTEM_PROMPTS, UniversalAgent
} from '../agent';

describe('ProfileModule & PromptLoader 舊版 Profile 相容性測試', () => {
    it('PromptLoader 應能正確載入 workspace/profiles/v1/ 下的三大預設 profile', () => {
        // 1. 測試載入 main_agent.json
        const mainProfile = PromptLoader.loadProfile('main_agent');
        expect(mainProfile).not.toBeNull();
        expect(mainProfile?.identity).toContain('SUPERNOVA');
        expect(mainProfile?.mission).toBeDefined();
        expect(mainProfile?.principles?.length).toBeGreaterThan(0);
        expect(mainProfile?.llmPreset).toBe('REASONING_FAST');

        // 2. 測試載入 task_agent.json
        const taskProfile = PromptLoader.loadProfile('task_agent');
        expect(taskProfile).not.toBeNull();
        expect(taskProfile?.identity).toContain('TaskAgent');
        expect(taskProfile?.principles?.some((p) => p.includes('PDCA'))).toBe(true);

        // 3. 測試載入 embodied_agent.json
        const embodiedProfile = PromptLoader.loadProfile('embodied_agent');
        expect(embodiedProfile).not.toBeNull();
        expect(embodiedProfile?.identity).toContain('EmbodiedAgent');
        expect(embodiedProfile?.action_guidelines?.length).toBeGreaterThan(0);
    });

    it('PromptLoader 具備快取命中能力', () => {
        PromptLoader.clearCache();
        const p1 = PromptLoader.loadProfile('main_agent');
        const p2 = PromptLoader.loadProfile('main_agent');
        expect(p1).toEqual(p2);
    });

    it('ProfileModule.load 應精確將 Profile 渲染為符合標準 PromptSectionIndex 的區塊', () => {
        const module = ProfileModule.load('main_agent');
        expect(module.name).toBe('profile');
        expect(module.priority).toBe(5);
        expect(module.llmPreset).toBe('REASONING_FAST');

        const sections = module.getPromptSections();
        expect(sections.length).toBe(4);

        // 驗證 Index 1: IDENTITY
        const identitySection = sections.find((s) => s.index === PromptSectionIndex.IDENTITY);
        expect(identitySection).toBeDefined();
        expect(identitySection!.content).toContain('SUPERNOVA');

        // 驗證 Index 2: SYSTEM_CORE
        const coreSection = sections.find((s) => s.index === PromptSectionIndex.SYSTEM_CORE);
        expect(coreSection).toBeDefined();
        expect(coreSection!.content).toContain('COMMUNICATION PROTOCOL');
        expect(coreSection!.content).toContain('【核心使命 (Mission)】');
        expect(coreSection!.content).toContain('【行為準則與底線 (Principles)】');

        // 驗證 Index 8: TACTICAL_GUIDELINE
        const tacticalSection = sections.find(
            (s) => s.index === PromptSectionIndex.TACTICAL_GUIDELINE
        );
        expect(tacticalSection).toBeDefined();
        expect(tacticalSection!.content).toContain('【特殊能力與權限 (Capabilities)】');
        expect(tacticalSection!.content).toContain('【輸出格式限制 (Output Format)】');

        // 驗證 Index 9: TOOL_USAGE
        const toolSection = sections.find((s) => s.index === PromptSectionIndex.TOOL_USAGE);
        expect(toolSection).toBeDefined();
        expect(toolSection!.content).toContain('【系統工具呼叫 (Tool Usage) & 驗證與錯誤處理】');
        expect(toolSection!.content).toContain('【資料指標壓縮處理 (Pointer Handling)】');
    });

    it('ProfileModule 支援自定義 Profile 物件與動態切換 setProfile', () => {
        const customProfile: AgentProfile = {
            identity: 'Test Identity',
            mission: 'Complete unit test',
            outputFormat: 'JSON only',
        };

        const module = ProfileModule.fromProfile(customProfile, false);
        let sections = module.getPromptSections();
        expect(sections.length).toBe(3); // IDENTITY, SYSTEM_CORE, TACTICAL_GUIDELINE (無 TOOL_USAGE 因 includeSystemPrompts = false)

        // 動態切換人設
        module.setProfile({
            identity: 'Updated Identity',
            mission: 'Updated Mission',
        });
        sections = module.getPromptSections();
        const identity = sections.find((s) => s.index === PromptSectionIndex.IDENTITY);
        expect(identity?.content).toBe('Updated Identity');
    });

    it('UniversalAgent 掛載 ProfileModule 後應能正常編譯執行並注入 Prompt', async () => {
        const eventBus = new EventBus();
        const configManager = new ConfigManager();
        configManager.registerSection('llm', LLMSectionSchema, {
            default_preset: 'default',
            embedding_model: 'mock-embed',
            embedding_provider: 'mock',
            presets: {
                default: {
                    modelName: 'gpt-4o-mini',
                    provider: 'mock',
                    temperature: 0
                },
                REASONING_FAST: {
                    modelName: 'gpt-4o-mini',
                    provider: 'mock',
                    temperature: 0
                },
            },
        });
        await configManager.load();

        const fakeModel = {
            invoke: async (messages: any[]) => {
                // 驗證傳給 LLM 的第一條 SystemMessage 是否包含 ProfileModule 注入的 IDENTITY 與 MISSION
                const systemMessage = messages[0];
                const content = typeof systemMessage.content === 'string' ? systemMessage.content : '';
                expect(content).toContain('SUPERNOVA');
                expect(content).toContain('【核心使命 (Mission)】');
                return new AIMessage({ content: 'Mock response from MainAgent profile' });
            },
        };

        const llmProvider = new LLMProvider(configManager);
        llmProvider.registerModelFactory('mock', () => fakeModel as any);

        const agent = new UniversalAgent('main_agent_01', eventBus, llmProvider);
        expect(agent.presetName).toBe('default');

        const profileModule = ProfileModule.load('main_agent');
        await agent.attachModule(profileModule);
        // 驗證掛載後，Agent 的 presetName 自動被 Profile 建議值修改為 REASONING_FAST
        expect(agent.presetName).toBe('REASONING_FAST');

        const response = await agent.run('Hello Agent');
        expect(response.content).toBe('Mock response from MainAgent profile');

        // 驗證 setProfile 動態更新 presetName
        profileModule.setProfile({
            identity: 'Fast Agent',
            llmPreset: 'default',
        });
        expect(agent.presetName).toBe('default');
    });
});
