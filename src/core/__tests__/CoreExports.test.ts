import { describe, expect, it } from 'bun:test';

import {
    AgentManager, ConfigManager, Kernel, KernelState, LLMProvider, UniversalAgent
} from '../index';

describe('src/core 核心導出驗證', () => {
    it('應能正確從 @supernova/runtime 載入 Kernel 並順暢運行', async () => {
        const kernel = new Kernel();
        expect(kernel.state).toBe(KernelState.INITIALIZING);

        await kernel.boot();
        expect(kernel.state).toBe(KernelState.RUNNING);

        await kernel.stop();
        expect(kernel.state).toBe(KernelState.STOPPED);
    });

    it('應能從 @core 導出 UniversalAgent, AgentManager, LLMProvider 等關鍵類別', () => {
        expect(UniversalAgent).toBeDefined();
        expect(AgentManager).toBeDefined();
        expect(LLMProvider).toBeDefined();
        expect(ConfigManager).toBeDefined();
    });
});
