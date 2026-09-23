import { describe, expect, it } from 'bun:test';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DataBlock, MessagePriority } from '../messaging';

describe('DataBlock 通用資料載體單元測試', () => {
    it('應能正確初始化並具備預設值與唯一 ID', () => {
        const block = new DataBlock({
            sessionId: 'session-001',
            senderId: 'user-01',
            controlPayload: 'Hello SuperNova',
        });

        expect(block.id).toBeDefined();
        expect(block.id.startsWith('block_')).toBe(true);
        expect(block.sessionId).toBe('session-001');
        expect(block.senderId).toBe('user-01');
        expect(block.targetId).toBeNull();
        expect(block.priority).toBe(MessagePriority.NORMAL);
        expect(block.type).toBe('system');
        expect(block.controlPayload).toBe('Hello SuperNova');
    });

    it('toMarkdown 應將 system 類型的 DataBlock 渲染為結構化 Markdown', () => {
        const block = new DataBlock({
            sessionId: 'session-123',
            senderId: 'worker-bash',
            targetId: 'agent-alice',
            type: 'system',
            intent: 'task_success',
            priority: MessagePriority.HIGH,
            controlPayload: { exitCode: 0, stdout: 'Build OK' },
            dataPointers: [
                { type: 'FILE', uri: 'workspace/hello.ts', metadata: { size: 100 } },
            ],
        });

        const md = block.toMarkdown();

        expect(md).toContain('### [EVENT: TASK_SUCCESS]');
        expect(md).toContain('- **Sender**: `worker-bash`');
        expect(md).toContain('- **Priority**: `URGENT / HIGH`');
        expect(md).toContain('**Payload**:');
        expect(md).toContain('"exitCode": 0');
        expect(md).toContain('"stdout": "Build OK"');
        expect(md).toContain('**Data Pointers**:');
        expect(md).toContain('- **FILE**: [workspace/hello.ts](workspace/hello.ts) (metadata: {"size":100})');
    });

    it('toMarkdown 應將 tool 類型的 DataBlock 渲染為工具調用結果', () => {
        const successBlock = new DataBlock({
            sessionId: 'session-123',
            senderId: 'tool-runner',
            type: 'tool',
            intent: 'TOOL_SUCCESS',
            controlPayload: {
                toolName: 'calculator',
                args: { a: 10, b: 20 },
                result: 30,
            },
        });

        const mdSuccess = successBlock.toMarkdown();
        expect(mdSuccess).toContain('### 🛠️ [TOOL: calculator]');
        expect(mdSuccess).toContain('- **Status**: SUCCESS');
        expect(mdSuccess).toContain('**Arguments**:');
        expect(mdSuccess).toContain('**Result**:');
        expect(mdSuccess).toContain('30');

        const errorBlock = new DataBlock({
            sessionId: 'session-123',
            senderId: 'tool-runner',
            type: 'tool',
            intent: 'TOOL_ERROR',
            controlPayload: {
                toolName: 'fetch_api',
                error: 'Network timeout',
            },
        });

        const mdError = errorBlock.toMarkdown();
        expect(mdError).toContain('### 🛠️ [TOOL: fetch_api]');
        expect(mdError).toContain('- **Status**: ERROR');
        expect(mdError).toContain('**Error Details**:');
        expect(mdError).toContain('Network timeout');
    });

    it('toMarkdown 對於 non-system 純文字應直接回傳乾淨文字', () => {
        const textBlock = new DataBlock({
            sessionId: 'session-123',
            senderId: 'user',
            type: 'human',
            controlPayload: 'Simple prompt string',
        });
        expect(textBlock.toMarkdown()).toBe('Simple prompt string');
    });

    it('toMessage 應正確映射為 LangChain 實例並支援 readerId 角色對齊', () => {
        const humanBlock = new DataBlock({
            sessionId: 'session-123',
            senderId: 'user-bob',
            type: 'human',
            controlPayload: 'What is your name?',
        });

        const humanMsg = humanBlock.toMessage();
        expect(humanMsg instanceof HumanMessage).toBe(true);
        expect(humanMsg.content).toBe('[Message from user-bob]:\nWhat is your name?');

        // AI 訊息：若讀取者是發送者自己，應轉換為 AIMessage
        const aiBlock = new DataBlock({
            sessionId: 'session-123',
            senderId: 'agent-nova',
            type: 'ai',
            controlPayload: 'I am SuperNova.',
        });

        const selfMsg = aiBlock.toMessage('agent-nova');
        expect(selfMsg instanceof AIMessage).toBe(true);
        expect(selfMsg.content).toBe('I am SuperNova.');

        // AI 訊息：若讀取者是其他 Agent，應包裝為 SystemMessage 防止角色混淆
        const otherMsg = aiBlock.toMessage('agent-observer');
        expect(otherMsg instanceof SystemMessage).toBe(true);
        expect(otherMsg.content).toBe('[Message from agent-nova]:\nI am SuperNova.');
    });

    it('toJSON 與 fromJSON 應能完美進行序列化與反序列化', () => {
        const original = new DataBlock({
            sessionId: 'session-xyz',
            senderId: 'sensor-01',
            targetId: 'brain-01',
            type: 'system',
            intent: 'TEMPERATURE_ALERT',
            priority: MessagePriority.URGENT,
            controlPayload: { temp: 85.5 },
            dataPointers: [{ type: 'VFS', uri: 'vfs://data/temp.log' }],
            metadata: { tag: 'hardware' },
        });

        const json = original.toJSON();
        const restored = DataBlock.fromJSON(json);

        expect(restored.id).toBe(original.id);
        expect(restored.sessionId).toBe('session-xyz');
        expect(restored.senderId).toBe('sensor-01');
        expect(restored.targetId).toBe('brain-01');
        expect(restored.priority).toBe(MessagePriority.URGENT);
        expect(restored.intent).toBe('TEMPERATURE_ALERT');
        expect(restored.controlPayload).toEqual({ temp: 85.5 });
        expect(restored.dataPointers).toEqual([{ type: 'VFS', uri: 'vfs://data/temp.log' }]);
        expect(restored.metadata.tag).toBe('hardware');
    });

    it('validateSize 應能防禦超大資料體積', () => {
        const smallBlock = new DataBlock({
            sessionId: 'session-1',
            senderId: 'tester',
            controlPayload: 'small',
        });
        expect(smallBlock.validateSize(100)).toBe(true);

        const largeBlock = new DataBlock({
            sessionId: 'session-1',
            senderId: 'tester',
            controlPayload: 'a'.repeat(200),
        });
        expect(largeBlock.validateSize(100)).toBe(false);
    });

    it('traverseAndReplaceLargeStrings 應能遞迴找出超大字串並進行非同步替換', async () => {
        const payload = {
            title: 'short',
            nested: {
                hugeContent: 'X'.repeat(500),
                arrayData: ['fine', 'Y'.repeat(600)],
            },
        };

        const { newPayload, hasChanges } = await DataBlock.traverseAndReplaceLargeStrings(
            payload,
            300,
            async (largeStr) => {
                return {
                    pointer: 'vfs://offloaded_data.txt',
                    originalLength: largeStr.length,
                };
            }
        );

        expect(hasChanges).toBe(true);
        expect(newPayload.title).toBe('short');
        expect(newPayload.nested.hugeContent).toEqual({
            pointer: 'vfs://offloaded_data.txt',
            originalLength: 500,
        });
        expect(newPayload.nested.arrayData[0]).toBe('fine');
        expect(newPayload.nested.arrayData[1]).toEqual({
            pointer: 'vfs://offloaded_data.txt',
            originalLength: 600,
        });
    });
});
