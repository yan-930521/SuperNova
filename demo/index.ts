import * as fs from 'fs';
import * as readline from 'readline';

import { SuperNovaApp } from '../src/core/app/SuperNovaApp';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports/ConsoleTransport';

async function main() {
    const logger = new LogManager({ type: 'SYSTEM', name: 'DemoApp' }).addTransport(new ConsoleTransport('INFO'));
    
    logger.info('=============================================');
    logger.info('   SuperNova v0.1.0 Interactive Demo');
    logger.info('=============================================');
    logger.info('Initializing system...');

    // 1. 初始化應用程式外觀層 (Facade)
    const app = new SuperNovaApp();

    // 每次執行 demo 前刪除舊的 config.yaml，強制使用預設值
    const configPath = './config.yaml';
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
    }

    // 啟動內核
    await app.start(configPath);

    const mainAgentId = 'demo-mainagent';
    const sessionId = 'demo-session';

    // 2. 初始化會話 (自動處理重載或創建)
    await app.initializeSession(sessionId, mainAgentId);

    // 3. 設定終端機對話
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const promptUser = () => {
        rl.question('\nYou: ', (input) => {
            const text = input.trim();
            if (text === 'exit') {
                logger.info('System shutting down...');
                app.stop().then(() => {
                    rl.close();
                    process.exit(0);
                });
                return;
            }

            if (text === '/day') {
                logger.info('Manually triggering SessionOptimization...');
                app.triggerSessionOptimization(sessionId);
                setTimeout(promptUser, 1000);
                return;
            }

            if (!text) {
                promptUser();
                return;
            }

            // 發送訊息給 Agent
            app.sendMessage(sessionId, text, mainAgentId, "User");
        });
    };

    // 4. 註冊回調事件
    app.onMessage((dataBlock) => {
        console.log(`\n[${dataBlock.senderId} -> ${dataBlock.targetId || 'NONE'}]:\n${dataBlock.toMarkdown()}`);
    });

    // 只有當指定的 Agent 轉為閒置狀態時，才重新顯示輸入提示字元
    app.onAgentIdle((agentId) => {
        if (agentId === mainAgentId) {
            promptUser();
        }
    });

    logger.info(`${mainAgentId} is online! Type "exit" to safely shutdown.`);
    // 首次啟動提示
    promptUser();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
