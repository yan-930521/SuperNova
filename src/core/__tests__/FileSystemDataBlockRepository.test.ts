import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

import { DEFAULT_AGENT_CONFIG } from '@core/config';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { LLMProvider, LLMSectionSchema } from '@supernova/common/llm';
import { EventBus } from '@supernova/events';
import { ConfigManager } from '@supernova/runtime';

import { HistoryModule } from '../agent/modules';
import { UniversalAgent } from '../agent/UniversalAgent';
import { DataBlock, FileSystemDataBlockRepository, MessagePriority } from '../messaging';

describe('FileSystemDataBlockRepository & HistoryModule 全量軌跡持久化測試', () => {
    const testDir = path.resolve('./tmp/test_datablock_repo_' + Date.now());
    let repo: FileSystemDataBlockRepository;

    beforeAll(() => {
        repo = new FileSystemDataBlockRepository({ baseDir: testDir });
    });

    afterAll(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {
            // 忽略測試目錄清理錯誤
        }
    });

    it('應能以 Append-Only 方式將 DataBlock 寫入 JSONL 並完整讀取還原', async () => {
        const b1 = new DataBlock({
            sessionId: 'sess_traj_1',
            senderId: 'user_alice',
            type: 'human',
            controlPayload: 'First User Message',
            timestamp: 1000,
        });

        const b2 = new DataBlock({
            sessionId: 'sess_traj_1',
            senderId: 'agent_bob',
            type: 'ai',
            controlPayload: 'First Agent Response',
            timestamp: 2000,
        });

        // 追加寫入
        await repo.appendForAgent('sess_traj_1', 'agent_bob', [b1, b2]);

        // 讀取全量軌跡
        const trajectory = await repo.findByAgent('sess_traj_1', 'agent_bob');
        expect(trajectory.length).toBe(2);
        expect(trajectory[0].id).toBe(b1.id);
        expect(trajectory[0].controlPayload).toBe('First User Message');
        expect(trajectory[1].id).toBe(b2.id);
        expect(trajectory[1].controlPayload).toBe('First Agent Response');

        // 第二次追加一筆工具回饋
        const b3 = new DataBlock({
            sessionId: 'sess_traj_1',
            senderId: 'agent_bob',
            type: 'tool',
            intent: 'TOOL_CALL',
            controlPayload: { toolName: 'calculator', result: '42' },
            timestamp: 3000,
        });
        await repo.appendForAgent('sess_traj_1', 'agent_bob', b3);

        const updated = await repo.findByAgent('sess_traj_1', 'agent_bob');
        expect(updated.length).toBe(3);
        expect(updated[2].type).toBe('tool');
        expect(updated[2].controlPayload.result).toBe('42');
    });

    it('讀取不存在的 Agent 歷史應回傳空陣列', async () => {
        const empty = await repo.findByAgent('sess_traj_1', 'non_existent_agent');
        expect(empty).toEqual([]);
    });

    it('應能正確支援 rotateHistoryFile 歷史輪轉歸檔', async () => {
        await repo.rotateHistoryFile('sess_traj_1', 'agent_bob', '2026-09-23');

        // 輪轉後原 history.jsonl 應變為空 (已重命名)
        const current = await repo.findByAgent('sess_traj_1', 'agent_bob');
        expect(current.length).toBe(0);
    });

    it('HistoryModule 與 FileSystemDataBlockRepository 協同：自動全量落盤與重啟還原', async () => {
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

        const sessionId = 'sess_recovery_test';
        const agentId = 'agent_persistent_tester';

        // 1. 建立第一個 Agent 實例，掛載具有 repository 的 HistoryModule
        const agent1 = new UniversalAgent(agentId, eventBus, llmProvider, {
            sessionId,
            presetName: 'mock_preset',
        });
        const historyMod1 = new HistoryModule({
            repository: repo,
            sessionId,
            maxMessages: 5,
        });
        await agent1.attachModule(historyMod1);

        // 進行對話 (觸發 callModel 與 onAfterRun 自動追加落盤)
        await agent1.run('我是使用者，請記住我的密碼是 123456');

        // 驗證磁碟中已經確實落盤了這筆歷史
        const savedTrajectory = await repo.findByAgent(sessionId, agentId);
        expect(savedTrajectory.length).toBeGreaterThanOrEqual(1);

        // 2. 模擬 Agent 重啟：建立全新的 Agent2 與全新的 HistoryModule2
        const agent2 = new UniversalAgent(agentId, eventBus, llmProvider, {
            sessionId,
            presetName: 'mock_preset',
        });
        const historyMod2 = new HistoryModule({
            repository: repo,
            sessionId,
            maxMessages: 5,
        });

        // 掛載時，onAttach 應自動從 repository 讀取全量歷史
        await agent2.attachModule(historyMod2);

        // 驗證記憶已無縫恢復
        expect(historyMod2.size).toBeGreaterThanOrEqual(1);
        const restoredMessages = historyMod2.getMessages();
        expect(restoredMessages.some((m) => m.content.toString().includes('123456'))).toBe(true);
    });

    describe('offloadLargePayloads 大資料卸載與 OOM 防護機制測試', () => {
        const sessionId = 'sess_offload_test';

        it('小於門檻值的純文字不應卸載，直接標記為 isCompacted 並保留原內容', async () => {
            const smallBlock = new DataBlock({
                sessionId,
                senderId: 'user',
                type: 'human',
                controlPayload: 'Short message within normal threshold',
            });

            const processed = await repo.offloadLargePayloads(sessionId, smallBlock, 100);
            expect(processed).toBe(smallBlock); // 引用同一物件
            expect(processed.isCompacted).toBe(true);
            expect(processed.dataPointers.length).toBe(0);
            expect(processed.controlPayload).toBe('Short message within normal threshold');
        });

        it('超大純文字應成功寫入 Blob 檔案並將 Payload 替換為 Pointer 指標', async () => {
            const largeText = 'SuperNova Large Data Content: ' + 'X'.repeat(500);
            const largeBlock = new DataBlock({
                sessionId,
                senderId: 'user',
                type: 'human',
                controlPayload: largeText,
            });

            // 門檻設為 100 字元，觸發卸載
            const processed = await repo.offloadLargePayloads(sessionId, largeBlock, 100);

            expect(processed).not.toBe(largeBlock); // 不可變性：應產生新實例
            expect(processed.id).toBe(largeBlock.id);
            expect(processed.isCompacted).toBe(true);
            expect(processed.dataPointers.length).toBe(1);

            const ptr = processed.dataPointers[0];
            expect(ptr.type).toBe('FILE');
            expect(ptr.uri.startsWith('blob_')).toBe(true);
            expect(ptr.metadata?.originalLength).toBe(largeText.length);
            expect(typeof processed.controlPayload).toBe('string');
            expect(processed.controlPayload).toContain(`<Pointer: ${ptr.uri}`);

            // 驗證實體磁碟 Blob 檔案能被 readBlob 還原為原完整字串
            const restoredText = await repo.readBlob(sessionId, ptr.uri);
            expect(restoredText).toBe(largeText);
        });

        it('巢狀物件中的超大字串應深層走訪並精確替換', async () => {
            const hugeLog = 'ERROR: Out of bounds\n' + 'LogDetailLine '.repeat(30);
            const nestedPayload = {
                toolName: 'bash_runner',
                code: 1,
                details: {
                    rawOutput: hugeLog,
                    status: 'FAIL',
                },
            };

            const block = new DataBlock({
                sessionId,
                senderId: 'tool',
                type: 'tool',
                controlPayload: nestedPayload,
            });

            const processed = await repo.offloadLargePayloads(sessionId, block, 50);

            expect(processed.dataPointers.length).toBe(1);
            expect(processed.controlPayload.toolName).toBe('bash_runner');
            expect(processed.controlPayload.details.status).toBe('FAIL');
            expect(processed.controlPayload.details.rawOutput).toContain('<Pointer: blob_');

            // 驗證原始超大字串能透過 readBlob 取回
            const blobId = processed.dataPointers[0].uri;
            const originalLog = await repo.readBlob(sessionId, blobId);
            expect(originalLog).toBe(hugeLog);
        });

        it('已 Compact 過的 DataBlock 再次呼叫應直接跳過 (冪等性保證)', async () => {
            const text = 'A'.repeat(200);
            const block = new DataBlock({
                sessionId,
                senderId: 'user',
                controlPayload: text,
            });

            const firstPass = await repo.offloadLargePayloads(sessionId, block, 50);
            expect(firstPass.isCompacted).toBe(true);
            expect(firstPass.dataPointers.length).toBe(1);

            // 第二次呼叫同一個已 compact 的實體
            const secondPass = await repo.offloadLargePayloads(sessionId, firstPass, 50);
            expect(secondPass).toBe(firstPass);
            expect(secondPass.dataPointers.length).toBe(1);
        });

        it('當 enable_payload_offload 為 false 時，應略過卸載並保留原始物件', async () => {
            const disabledRepo = new FileSystemDataBlockRepository({
                baseDir: testDir,
                agent: {
                    ...DEFAULT_AGENT_CONFIG,
                    enable_payload_offload: false,
                },
            });

            const largeText = 'Do Not Offload Me: ' + 'Y'.repeat(500);
            const block = new DataBlock({
                sessionId,
                senderId: 'user',
                controlPayload: largeText,
            });

            const result = await disabledRepo.offloadLargePayloads(sessionId, block, 50);
            expect(result).toBe(block);
            expect(result.dataPointers.length).toBe(0);
            expect(result.controlPayload).toBe(largeText);
        });

        it('應正確支援 new_message (寬鬆) 與 compact (嚴格) 兩段式門檻卸載', async () => {
            const twoStageRepo = new FileSystemDataBlockRepository({
                baseDir: testDir,
                thresholdNewMessage: 500,
                thresholdCompact: 100,
            });

            const mediumText = 'Z'.repeat(250);
            const block = new DataBlock({
                sessionId,
                senderId: 'user',
                controlPayload: mediumText,
            });

            // 1. 即時新訊息階段 (250 < 500)：不應被卸載
            const newMsgResult = await twoStageRepo.offloadLargePayloads(sessionId, block, 'new_message');
            expect(newMsgResult).toBe(block);
            expect(newMsgResult.dataPointers.length).toBe(0);

            // 2. 歷史壓縮階段 (250 > 100)：應被強制卸載為 Blob
            const uncompactedBlock = new DataBlock({
                sessionId,
                senderId: 'user',
                controlPayload: mediumText,
            });
            const compactResult = await twoStageRepo.offloadLargePayloads(sessionId, uncompactedBlock, 'compact');
            expect(compactResult).not.toBe(uncompactedBlock);
            expect(compactResult.dataPointers.length).toBe(1);
            expect(compactResult.controlPayload).toContain('<Pointer: blob_');

            // 驗證還原
            const blobContent = await twoStageRepo.readBlob(sessionId, compactResult.dataPointers[0].uri);
            expect(blobContent).toBe(mediumText);
        });

        it('HistoryModule 在對話產出大字串時，自動將大資料落盤為 Blob 並保存 Pointer', async () => {
            const eventBus = new EventBus();
            const configManager = new ConfigManager();
            configManager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'mock_preset',
                embedding_model: 'mock-embed',
                embedding_provider: 'mock',
                presets: {
                    mock_preset: {
                        provider: 'mock',
                        modelName: 'mock-model',
                        temperature: 0
                    },
                },
            });
            await configManager.load();
            const llmProvider = new LLMProvider(configManager);
            await llmProvider.initialize();
            await llmProvider.start();

            // 設定較小的卸載門檻 (例如 200 字元)
            const offloadRepo = new FileSystemDataBlockRepository({
                baseDir: testDir,
                defaultThreshold: 200,
            });

            const agent = new UniversalAgent('agent_offload_history', eventBus, llmProvider, {
                sessionId: 'sess_history_offload',
                presetName: 'mock_preset',
            });
            const historyMod = new HistoryModule({
                repository: offloadRepo,
                sessionId: 'sess_history_offload',
            });
            await agent.attachModule(historyMod);

            // 輸入一則 1000 字元的超長使用者訊息
            const massiveInput = 'User Big Input: ' + 'M'.repeat(1000);
            await agent.run(massiveInput);

            // 檢驗在磁碟中讀取出的全量歷史紀錄
            const savedBlocks = await offloadRepo.findByAgent('sess_history_offload', 'agent_offload_history');
            expect(savedBlocks.length).toBeGreaterThanOrEqual(1);

            // 第一則輸入訊息應已被卸載為 Pointer
            const userBlock = savedBlocks.find((b) => b.type === 'human');
            expect(userBlock).toBeDefined();
            expect(userBlock!.dataPointers.length).toBe(1);
            expect(userBlock!.controlPayload).toContain('<Pointer: blob_');

            // 驗證能透過 readBlob 讀出完整原始輸入
            const blobId = userBlock!.dataPointers[0].uri;
            const fullRestored = await offloadRepo.readBlob('sess_history_offload', blobId);
            expect(fullRestored).toBe(massiveInput);
        });
    });

    describe('輔助記憶與元資料能力測試 (Daily Summary & Agent List)', () => {
        const sumSessionId = 'sess_summary_test';

        it('saveDailySummary 與 getRecentSummaries 應正確保存並依時間由舊到新讀取', async () => {
            await repo.saveDailySummary(sumSessionId, '2026-09-21', '# Day 1 Summary');
            await repo.saveDailySummary(sumSessionId, '2026-09-22', '# Day 2 Summary');
            await repo.saveDailySummary(sumSessionId, '2026-09-23', '# Day 3 Summary');

            const summaries = await repo.getRecentSummaries(sumSessionId, 2);
            expect(summaries.length).toBe(2);
            // 由於內部依最新優先截取前 2 天 (22 與 23)，再倒轉為順序輸出，故應為 Day 2, Day 3
            expect(summaries[0]).toBe('# Day 2 Summary');
            expect(summaries[1]).toBe('# Day 3 Summary');
        });

        it('listAgentsForSession 應正確列出會話中建立過歷史的 Agent 清單', async () => {
            const block = new DataBlock({
                sessionId: 'sess_agents_list',
                senderId: 'agent_alpha',
                controlPayload: 'hello',
            });
            await repo.appendForAgent('sess_agents_list', 'agent_alpha', block);
            await repo.appendForAgent('sess_agents_list', 'agent_beta', block);

            const agents = await repo.listAgentsForSession('sess_agents_list');
            expect(agents).toContain('agent_alpha');
            expect(agents).toContain('agent_beta');
        });
    });
});
