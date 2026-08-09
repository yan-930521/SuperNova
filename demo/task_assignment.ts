import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';

import { AgentManager } from '../src/core/agent/AgentManager';
import { AgentType } from '../src/core/agent/BaseAgent';
import { ConfigLoader } from '../src/core/config/ConfigLoader';
import { AgentEvent, IEvent, SystemEvent } from '../src/core/domain/IBus';
import { RuntimeKernel } from '../src/core/lifecycle/RuntimeKernel';
import { DataBlock, MessagePriority } from '../src/core/messaging/DataBlock';
import { EventBus } from '../src/core/messaging/EventBus';
import { SessionManager } from '../src/core/session/SessionManager';
import { TaskManager } from '../src/core/task/TaskManager';

dotenvConfig();

async function main() {
    console.log('=============================================');
    console.log('   SuperNova Task Assignment Demo');
    console.log('=============================================');
    console.log('Initializing system...');

    const configPath = './config.yaml';
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
    }

    const loader = new ConfigLoader();
    const config = await loader.bootstrap(configPath);
    const kernel = new RuntimeKernel(config);

    await kernel.initialize();
    await kernel.start();

    const container = kernel.getContainer();
    const eventBus = container.resolve<EventBus>('EventBus');
    const agentManager = container.resolve<AgentManager>('AgentManager');
    const sessionManager = container.resolve<SessionManager>('SessionManager');
    const taskManager = container.resolve<TaskManager>('TaskManager');

    const MainAgentId = 'demo-mainagent';
    const sessionId = 'task-demo-session';

    // 1. 初始化會話 (Session)
    try {
        await sessionManager.loadSession(sessionId);
    } catch (e: any) {
        if (e.message && e.message.includes('Session not found')) {
            await sessionManager.createSession(MainAgentId, sessionId, 'PERSISTENT');
            await sessionManager.saveSession(sessionId);
        } else {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    }

    console.log(`[系統] 會話已建立: ${sessionId}`);

    // 2. 訂閱各種事件以便監控流程
    eventBus.subscribe(SystemEvent.TaskCreated, (e) => {
        console.log(`\n[EVENT: TaskCreated] ${e.payload.taskId}`);
    });

    eventBus.subscribe(SystemEvent.TaskFinished, (e) => {
        console.log(`\n[EVENT: TaskFinished] ${e.payload.taskId}, Result: ${e.payload.result}`);
        // 任務結束時關閉系統
        setTimeout(() => {
            console.log('\n[系統] 任務已完成，關閉系統。');
            process.exit(0);
        }, 3000);
    });

    eventBus.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
        const dataBlock = event.payload;
        if (Array.isArray(dataBlock)) {
            dataBlock.forEach((d) => {
                console.log(`\n[${d.senderId} -> ${d.targetId || 'NONE'}]:\n${d.toMarkdown()}`);
            })
        } else {
            console.log(`\n[${dataBlock.senderId} -> ${dataBlock.targetId || 'NONE'}]:\n${dataBlock.toMarkdown()}`);
        }
    });

    // 3. 建立一個負責執行任務的 TaskAgent
    const workerId = 'worker-1';
    await agentManager.spawnAgent(AgentType.TASK, workerId, sessionId, {
        workspaceType: 'PERSISTENT',
        isTemp: true, // 測試自動銷毀機制
        allowedTools: ['write_file']
    });
    console.log(`[系統] 建立 TaskAgent: ${workerId} (isTemp: true)`);

    // 4. 新增任務到 DAG 中 (這會建立一個狀態為 PENDING 的任務)
    console.log(`\n[系統] 新增任務 task-1`);
    taskManager.addTasks(sessionId, [
        {
            id: 'task-1',
            objective: 'Write a simple hello_world.txt file containing "Hello SuperNova" in the current directory.',
            dependencies: [],
            creatorId: MainAgentId
        }
    ]);

    // 查看目前的任務狀態 (應該會自動變成 READY)
    let tasks = taskManager.getAllTasks(sessionId);
    console.log(`[系統] 任務狀態 (剛加入後): ${tasks[0].status}`);

    // 5. 指派任務給 worker-1
    // 這會修改任務的 assignedAgentId，並呼叫 refreshTaskStates
    // 預期 refreshTaskStates 會把狀態改為 IN_PROGRESS，並觸發一則 TASK_ASSIGNMENT 的 AgentMessage 給 worker-1
    console.log(`\n[系統] 呼叫 assignTask('task-1', '${workerId}')`);
    taskManager.assignTask(sessionId, 'task-1', workerId);

    tasks = taskManager.getAllTasks(sessionId);
    console.log(`[系統] 任務狀態 (指派後): ${tasks[0].status}`);

    console.log('\n[系統] 任務已派發！觀察 Worker-1 是否會自動開始執行並回報結果...');

    // 讓程序保持執行
    setInterval(() => { }, 1000);
}

main().catch(console.error);
