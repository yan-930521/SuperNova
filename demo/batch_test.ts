import { config as dotenvConfig } from 'dotenv';

import { AgentManager } from '../src/core/agent/AgentManager';
import { DEFAULT_CONFIG } from '../src/core/config/DefaultConfig';
import { RuntimeKernel } from '../src/core/lifecycle/RuntimeKernel';
import { DataBlock } from '../src/core/messaging/DataBlock';
import { EventBus } from '../src/core/messaging/EventBus';
import { AgentEvent, IEvent } from '../src/core/messaging/IBus';
import { SessionManager } from '../src/core/session/SessionManager';

dotenvConfig();

async function main() {
    console.log('=============================================');
    console.log('   SuperNova Batch Multi-User Demo');
    console.log('=============================================');
    console.log('Initializing system...');

    const config = DEFAULT_CONFIG;
    const kernel = new RuntimeKernel(config);

    // 1. 透過內核啟動所有系統組件
    await kernel.initialize();
    await kernel.start();

    // 取出所需的系統服務
    const container = kernel.getContainer();
    const eventBus = container.resolve<EventBus>('EventBus');
    const sessionManager = container.resolve<SessionManager>('SessionManager');

    const MainAgentId = 'demo-mainagent';
    const sessionId = `demo-session-batch-${Date.now()}`;

    // 2. 初始化會話 (Session)
    // 為了確保每次測試都是乾淨的環境，我們直接建立帶有時間戳的全新 Session
    await sessionManager.createSession(MainAgentId, sessionId, 'PERSISTENT');
    await sessionManager.saveSession(sessionId);
    console.log(`[系統] 成功建立全新會話: ${sessionId}`);

    // 3. 訂閱全局 AgentMessage 來接收 Agent 的回覆
    eventBus.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
        const dataBlock = event.payload;
        // 我們不印出人類發送的訊息，只印出 Agent 的回覆
        if (dataBlock && !dataBlock.senderId.startsWith('USER_')) {
            console.log(`\n[${dataBlock.senderId} -> ${dataBlock.targetId || 'BROADCAST'}]:\n${dataBlock.toMarkdown()}`);
        }
    });

    console.log(`\n[系統] ${MainAgentId} 已上線！準備批量發送訊息...`);

    // 4. 定義多位使用者的批量訊息
    const userMessages = [
        { sender: 'USER_ALICE', text: '你好，我是 Alice！請問你能幫我計算 123 + 456 嗎？請私下告訴我答案。' },
        { sender: 'USER_BOB', text: '嗨，我是 Bob！不用理會 Alice，請告訴我今天天氣如何。' },
        { sender: 'USER_CHARLIE', text: '我是 Charlie，你們兩位冷靜一點。Agent，請做個簡單的自我介紹。' }
    ];

    console.log(`\n[系統] 為了模擬「一口氣接收」，我們先將 Agent 鎖定 (強制設為 BUSY)...`);
    const agentManager = container.resolve<AgentManager>('AgentManager');
    const agent = agentManager.getAgent(MainAgentId);
    if (agent) {
        // 使用 any 強制越過 protected 限制
        (agent as any).setState('BUSY');
    }

    // 5. 批量發送訊息 (優化：並行傳入)
    // 透過 Promise.all 與 publishAsync 實現真正的並行發送，測試 SessionManager 與 Inbox 的處理能力
    const publishPromises = userMessages.map(msg => {
        console.log(`[測試腳本] ${msg.sender} 發送訊息: ${msg.text}`);
        
        const messageBlock = new DataBlock({
            sessionId: sessionId,
            senderId: msg.sender,
            targetId: MainAgentId,
            type: 'human',
            intent: 'USER_INPUT',
            controlPayload: msg.text
        });

        // 透過 publishAsync 非同步並行傳遞
        return eventBus.publishAsync({
            type: AgentEvent.AgentMessage,
            timestamp: Date.now(),
            sessionId: sessionId,
            payload: messageBlock
        });
    });

    // 等待所有訊息都確實送入 Inbox 與資料庫
    await Promise.all(publishPromises);
    console.log(`\n[系統] 批量發送完畢，所有訊息已進入 Inbox。`);

    // 解鎖 Agent，模擬一次性處理
    console.log(`[系統] 解鎖 Agent (設回 IDLE)，觸發一口氣處理...`);
    if (agent) {
        (agent as any).setState('IDLE');
    }

    // 由於事件驅動是非同步的，我們讓程式等待一段時間後再關閉
    setTimeout(() => {
        console.log('\n[系統] 測試時間結束，系統關閉中，正在儲存記憶...');
        kernel.stop().then(() => process.exit(0));
    }, 15000); // 這裡設定等待 15 秒以便讓 Agent 完成思考和回覆
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
