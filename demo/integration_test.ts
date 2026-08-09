import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';

import { AgentManager } from '../src/core/agent/AgentManager';
import { AgentType } from '../src/core/agent/BaseAgent';
import { ConfigLoader } from '../src/core/config/ConfigLoader';
import { RuntimeKernel } from '../src/core/lifecycle/RuntimeKernel';
import { DataBlock } from '../src/core/messaging/DataBlock';
import { EventBus } from '../src/core/messaging/EventBus';
import { IEventBus } from '../src/core/domain/IBus';
import { AgentEvent, IEvent, SystemEvent } from '../src/core/domain/IBus';
import { SessionManager } from '../src/core/session/SessionManager';

dotenvConfig();

/**
 * 整合測試 Demo
 * 用於驗證系統所有模組的端對端串接，包含：
 * - RuntimeKernel 啟動與 IoC 容器
 * - MainAgent 推理與 ReAct 迴圈
 * - StrategizeAndPlanTool (LATS/MCTS 策略搜尋)
 * - TaskDAG 生成與 TaskManager 管理
 * - WorkspaceTools (ReadFile, WriteFile, ListFiles, RunBash)
 * - AgentTools (SendMessage, SpawnAgent, ToggleProjection)
 * - SessionManager 持久化與恢復
 * - MemoryManager 背景記憶萃取 (Graph Memory)
 * - EventBus 非同步事件驅動
 */
async function main() {
    console.log('=============================================');
    console.log('   SuperNova Integration Test Demo');
    console.log('=============================================');
    console.log('Initializing system...');

    // 每次執行前刪除舊的 config.yaml，強制使用預設值
    const configPath = './config.yaml';
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
    }

    const loader = new ConfigLoader();
    const config = await loader.bootstrap(configPath);
    const kernel = new RuntimeKernel(config);

    // 透過內核啟動所有系統組件
    await kernel.initialize();
    await kernel.start();

    // 從 Kernel 的 IoC 容器中取出需要的服務
    const container = kernel.getContainer();
    const eventBus = container.resolve<EventBus>('EventBus');
    const agentManager = container.resolve<AgentManager>('AgentManager');
    const sessionManager = container.resolve<SessionManager>('SessionManager');

    const MainAgentId = 'integration-mainagent';
    const sessionId = 'integration-test-session';

    // 初始化會話 (使用獨立的 sessionId 避免與其他 Demo 衝突)
    try {
        await sessionManager.loadSession(sessionId);
        console.log(`[System] Loaded existing session: ${sessionId}`);
    } catch (e: any) {
        if (e.message && e.message.includes('Session not found')) {
            await sessionManager.createSession(MainAgentId, sessionId, 'PERSISTENT');
            await sessionManager.saveSession(sessionId);
            console.log(`[System] Created new session: ${sessionId}`);
        } else {
            console.error(`[System] Failed to load session. Error: ${e.message}`);
            process.exit(1);
        }
    }

    // 設定終端機互動介面
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = () => {
        rl.question('\nYou: ', (input) => {
            const text = input.trim();
            if (text === 'exit') {
                console.log('Shutting down...');
                kernel.stop().then(() => {
                    rl.close();
                    process.exit(0);
                });
                return;
            }

            if (text === '/day') {
                console.log('[System] Manually triggering daily optimization (SessionOptimization)...');
                eventBus.publish({
                    type: SystemEvent.SessionOptimization,
                    timestamp: Date.now(),
                    sessionId: sessionId,
                    payload: { sessionId, targetDate: new Date().toLocaleDateString('en-CA') }
                });
                setTimeout(ask, 1000);
                return;
            }

            if (!text) {
                ask();
                return;
            }

            // 發送訊息給 MainAgent
            const messageBlock = new DataBlock({
                sessionId: sessionId,
                senderId: 'USER',
                targetId: MainAgentId,
                type: 'human',
                intent: 'USER_INPUT',
                controlPayload: text,
                metadata: {
                    senderName: "Tester"
                }
            });

            // 透過 AgentMessage 頻道廣播
            eventBus.publish({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId: sessionId,
                payload: messageBlock
            });
        });
    };

    // 訂閱全局 AgentMessage 來接收 MainAgent 的回覆
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

    console.log(`\n[System] ${MainAgentId} is online! Type "exit" to safely shutdown.`);
    console.log(`[System] Session: ${sessionId}`);
    console.log(`[System] Type "/day" to manually trigger daily optimization.\n`);
    console.log('--- Suggested test prompts ---');
    console.log('1. "List all files in the current workspace"');
    console.log('2. "Write a short greeting to hello.md"');
    console.log('3. "Plan a TODO App project using StrategizeAndPlan"');
    console.log('4. "Check the task dashboard"');
    console.log('-----------------------------\n');
    ask();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
