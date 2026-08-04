import { config as dotenvConfig } from 'dotenv';
import * as readline from 'readline';

import { AgentManager } from '../src/core/agent/AgentManager';
import { AgentType } from '../src/core/agent/BaseAgent';
import { ConfigLoader } from '../src/core/config/ConfigLoader';
import { RuntimeKernel } from '../src/core/lifecycle/RuntimeKernel';
import { DataBlock } from '../src/core/messaging/DataBlock';
import { EventBus } from '../src/core/messaging/EventBus';
import { AgentEvent, IEvent } from '../src/core/messaging/IBus';
import { SessionManager } from '../src/core/session/SessionManager';

dotenvConfig();

async function main() {
    console.log('=============================================');
    console.log('   SuperNova v0.1.0 Interactive Demo');
    console.log('=============================================');
    console.log('Initializing system...');

    const loader = new ConfigLoader();
    const config = await loader.bootstrap('./config.json');
    const kernel = new RuntimeKernel(config);

    // 1. 透過內核啟動所有系統組件 (IoC, Repo, Managers)
    await kernel.initialize();
    await kernel.start();

    // 從 Kernel 的 IoC 容器中取出我們需要的服務
    const container = kernel.getContainer();
    const eventBus = container.resolve<EventBus>('EventBus');
    const agentManager = container.resolve<AgentManager>('AgentManager');
    const sessionManager = container.resolve<SessionManager>('SessionManager');

    const MainAgentId = 'demo-mainagent';
    const sessionId = 'demo-session';

    // 2. 初始化會話 (Session)
    try {
        await sessionManager.loadSession(sessionId);
        console.log(`[系統] 載入既有會話: ${sessionId}`);
    } catch (e: any) {
        if (e.message && e.message.includes('Session not found')) {
            await sessionManager.createSession(MainAgentId, sessionId, 'PERSISTENT');
            await sessionManager.saveSession(sessionId);
            console.log(`[系統] 成功建立新會話: ${sessionId}`);
        } else {
            console.error(`[系統] 讀取既有會話失敗，可能是檔案損毀，為避免覆寫已中斷啟動。錯誤: ${e.message}`);
            process.exit(1);
        }
    }

    // 4. 設定終端機對話
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = () => {
        rl.question('\nYou: ', (input) => {
            const text = input.trim();
            if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
                console.log('系統關閉中，正在儲存記憶...');
                kernel.stop().then(() => process.exit(0));
                return;
            }

            if (!text) {
                ask();
                return;
            }

            // 發送訊息給夏沫 (指名 targetId)
            const messageBlock = new DataBlock({
                sessionId: sessionId,
                senderId: 'USER',
                targetId: MainAgentId,
                type: 'human',
                intent: 'USER_INPUT',
                controlPayload: text
            });

            // 透過標準的 AgentMessage 頻道廣播
            eventBus.publish({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId: sessionId,
                payload: messageBlock
            });
        });
    };

    // 3. 訂閱全局 AgentMessage 來接收夏沫的回覆
    eventBus.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
        const dataBlock = event.payload;
        if (Array.isArray(dataBlock)) {
            dataBlock.forEach((d) => {
                console.log(`\n[${d.senderId} -> ${d.targetId || 'NONE'}]:\n${d.toMarkdown()}`);
            })
        } else {
            console.log(`\n[${dataBlock.senderId} -> ${dataBlock.targetId || 'NONE'}]:\n${dataBlock.toMarkdown()}`);
        }

        setTimeout(ask, 5000);
    });

    console.log(`\n[系統] ${MainAgentId} 已上線！輸入 "exit" 即可安全離開。`);
    ask();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
