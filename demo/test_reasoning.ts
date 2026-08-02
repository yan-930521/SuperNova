import { config as dotenvConfig } from 'dotenv';

import { DEFAULT_CONFIG } from '../src/core/config/DefaultConfig';
import { RuntimeKernel } from '../src/core/lifecycle/RuntimeKernel';
import { DataBlock } from '../src/core/messaging/DataBlock';
import { EventBus } from '../src/core/messaging/EventBus';
import { AgentEvent, IEvent } from '../src/core/messaging/IBus';
import { SessionManager } from '../src/core/session/SessionManager';
import { AgentManager } from '../src/core/agent/AgentManager';

dotenvConfig();

async function main() {
    console.log('=============================================');
    console.log('   SuperNova Reasoning Preset Test');
    console.log('=============================================');
    
    const config = DEFAULT_CONFIG;
    const kernel = new RuntimeKernel(config);

    await kernel.initialize();
    await kernel.start();

    const container = kernel.getContainer();
    const eventBus = container.resolve<EventBus>('EventBus');
    const sessionManager = container.resolve<SessionManager>('SessionManager');
    const agentManager = container.resolve<AgentManager>('AgentManager');

    const MainAgentId = 'demo-mainagent';
    const sessionId = `demo-reasoning-${Date.now()}`;

    await sessionManager.createSession(MainAgentId, sessionId, 'PERSISTENT');
    await sessionManager.saveSession(sessionId);
    
    // 強制將 Agent 的 Preset 替換為 REASONING_FAST
    const mainAgent = await agentManager.getOrWakeupAgent(MainAgentId, sessionId);
    if (mainAgent) {
        const profile = mainAgent.getProfile() || {};
        profile.llmPreset = 'REASONING_FAST';
        mainAgent.setProfile(profile);
    }

    eventBus.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
        const dataBlock = event.payload;
        if (dataBlock && !dataBlock.senderId.startsWith('USER_')) {
            console.log(`\n[${dataBlock.senderId} -> ${dataBlock.targetId || 'BROADCAST'}]:\n${dataBlock.toMarkdown()}`);
        }
    });

    console.log(`\n[系統] 準備發送測試指令...`);
    
    const block = new DataBlock({
        sessionId,
        senderId: 'USER_TEST',
        targetId: MainAgentId,
        type: 'human',
        intent: 'USER_INPUT',
        controlPayload: '你有辦法平行調用工具嗎？請你一邊思考一邊建立 01.txt、02.txt、03.txt，內容隨機。'
    });

    await eventBus.publishAsync({
        type: AgentEvent.AgentMessage,
        timestamp: Date.now(),
        sessionId,
        payload: block
    });

    console.log(`[系統] 訊息已發送，等待 Agent 推理與執行 (可能需要較長時間)...\n`);

    // 等待 20 秒讓系統執行完畢
    setTimeout(async () => {
        console.log('\n[系統] 測試時間結束，系統關閉中...');
        await kernel.stop();
        process.exit(0);
    }, 20000);
}

main().catch(console.error);
