import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { ConfigManager, ConfigValidationError } from '../../common/src/config/ConfigManager';
import { EnvParser } from '../../common/src/config/EnvParser';

describe('@supernova/runtime 可擴展配置系統測試', () => {
    describe('EnvParser 環境變數解析器', () => {
        it('應能依雙底線分割巢狀路徑並自動轉型', () => {
            const fakeEnv = {
                SUPERNOVA_LLM__TEMPERATURE: '0.7',
                SUPERNOVA_AGENT__ENABLED: 'true',
                SUPERNOVA_STORAGE__TAGS: '["tag1", "tag2"]',
                SUPERNOVA_SERVER__HOST: 'localhost',
                OTHER_ENV_KEY: 'ignore_me',
            };

            const parsed = EnvParser.parse(fakeEnv, 'SUPERNOVA_');

            expect(parsed.llm.temperature).toBe(0.7);
            expect(parsed.agent.enabled).toBe(true);
            expect(parsed.storage.tags).toEqual(['tag1', 'tag2']);
            expect(parsed.server.host).toBe('localhost');
            expect(parsed.other_env_key).toBeUndefined();
        });
    });

    describe('ConfigManager 核心功能', () => {
        const LLMSectionSchema = z.object({
            default_preset: z.string(),
            temperature: z.number().min(0).max(2),
        });

        const AgentSectionSchema = z.object({
            max_steps: z.number().default(5),
            enable_projection: z.boolean().default(false),
        });

        it('動態註冊獨立 Section 並以預設值加載', async () => {
            const manager = new ConfigManager();

            manager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'gpt-4o',
                temperature: 0.5,
            });

            manager.registerSection('agent', AgentSectionSchema, {
                max_steps: 10,
                enable_projection: true,
            });

            expect(manager.hasSection('llm')).toBe(true);
            expect(manager.hasSection('agent')).toBe(true);

            await manager.load();

            const llm = manager.get<z.infer<typeof LLMSectionSchema>>('llm');
            expect(llm.default_preset).toBe('gpt-4o');
            expect(llm.temperature).toBe(0.5);

            const agent = manager.get<z.infer<typeof AgentSectionSchema>>('agent');
            expect(agent.max_steps).toBe(10);
            expect(agent.enable_projection).toBe(true);
        });

        it('多來源階梯覆蓋：執行期 Overrides 應能覆寫預設值', async () => {
            const manager = new ConfigManager();

            manager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'gpt-4o-mini',
                temperature: 0.2,
            });

            await manager.load({
                overrides: {
                    llm: {
                        temperature: 0.8,
                    },
                },
            });

            const llm = manager.get<z.infer<typeof LLMSectionSchema>>('llm');
            // default_preset 保持預設，temperature 被 override
            expect(llm.default_preset).toBe('gpt-4o-mini');
            expect(llm.temperature).toBe(0.8);
        });

        it('環境變數覆寫：符合前綴之 ENV 應覆寫預設值', async () => {
            const manager = new ConfigManager();

            manager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'claude-3-5',
                temperature: 0.1,
            });

            // 模擬環境變數
            process.env.SUPERNOVA_TEST_LLM__TEMPERATURE = '1.5';

            await manager.load({
                envPrefix: 'SUPERNOVA_TEST_',
            });

            const llm = manager.get<z.infer<typeof LLMSectionSchema>>('llm');
            expect(llm.temperature).toBe(1.5);

            delete process.env.SUPERNOVA_TEST_LLM__TEMPERATURE;
        });

        it('Zod 嚴格校驗失敗時應拋出 ConfigValidationError 並提供精準錯誤訊息', async () => {
            const manager = new ConfigManager();

            manager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'gpt-4o',
                temperature: 0.5,
            });

            // 傳入不合法的 temperature (> 2)
            expect(
                manager.load({
                    overrides: {
                        llm: {
                            temperature: 999,
                        },
                    },
                })
            ).rejects.toThrow(ConfigValidationError);
        });

        it('加載後應深度凍結 (Object.isFrozen)，防止執行期惡意或意外篡改', async () => {
            const manager = new ConfigManager();

            manager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'gpt-4o',
                temperature: 0.5,
            });

            await manager.load();

            const llm = manager.get<any>('llm');
            expect(Object.isFrozen(llm)).toBe(true);

            // 嘗試修改屬性在 strict 模式或 Object.freeze 下應拋出異常或靜默失敗
            expect(() => {
                llm.temperature = 1.0;
            }).toThrow();
        });

        it('設定檔不存在時應能自動生成帶註解的 YAML 範本檔並成功載入', async () => {
            const fs = await import('fs/promises');
            const testYamlPath = 'packages/runtime/__tests__/fixtures/auto_generated.yaml';

            // 清理舊檔案
            try {
                await fs.unlink(testYamlPath);
            } catch {}

            const manager = new ConfigManager();
            const AnnotatedSchema = z.object({
                model: z.string().describe('Target LLM model name'),
                temperature: z.number().describe('Sampling temperature between 0 and 2'),
            });

            manager.registerSection('annotated', AnnotatedSchema, {
                model: 'claude-3-5-sonnet',
                temperature: 0.3,
            });

            await manager.load({
                filePath: testYamlPath,
                generateIfMissing: true,
            });

            // 驗證檔案已被自動建立
            const fileExists = await fs.stat(testYamlPath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);

            // 驗證生成的 YAML 包含註解
            const fileContent = await fs.readFile(testYamlPath, 'utf-8');
            expect(fileContent).toContain('# Target LLM model name');
            expect(fileContent).toContain('model: claude-3-5-sonnet');

            // 驗證值成功載入
            const config = manager.get<any>('annotated');
            expect(config.model).toBe('claude-3-5-sonnet');
            expect(config.temperature).toBe(0.3);

            // 清理測試檔案
            await fs.unlink(testYamlPath);
        });
    });
});
