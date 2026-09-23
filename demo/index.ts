import * as readline from 'readline';

import { LLMProvider, LLMSectionSchema } from '@supernova/common/llm';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { EventBus } from '@supernova/events/EventBus';
import {
    HookEvent, PromptSectionIndex, SessionEvent, SessionMessageType
} from '@supernova/events/IBus';
import { ConfigManager, Kernel } from '@supernova/runtime';

import {
    AgentManager, FileSystemProfileRepository, HistoryModule, JsonGraphRepository, MemoryModule, ProfileModule
} from '../src/core';
import {
    AgentConfig, AgentSectionSchema, DEFAULT_AGENT_CONFIG, DEFAULT_STORAGE_CONFIG, StorageConfig,
    StorageSectionSchema
} from '../src/core/config';
import {
    DataBlock, FileSystemDataBlockRepository, MessagePriority, MessageRouter
} from '../src/core/messaging';
import { FileSystemSessionRepository, SessionManager, SessionState } from '../src/core/session';

/**
 * SuperNova v0.3.1 核心互動式展示程序 (Interactive Demo)
 * 完整演示：
 * 1. 微內核架構 (Kernel) 與動態外掛生命週期
 * 2. 會話沙盒 (Session) 與本地狀態持久化 (FileSystemSessionRepository)
 * 3. 訊息路由器 (MessageRouter) 與 SessionEvent.SessionMessage 全場域通訊
 * 4. 歷史管理器官模組 (HistoryModule)：時間感知插針、滑動省 Token 壓縮、JSONL 全量軌跡
 * 5. 大資料卸載 (Large Payload Offloading & Pointer 分離機制)：OOM 核心防禦
 * 6. LangChain ReactAgent 圖執行與 ProfileModule 人設認知注入
 */
async function main() {
    const logger = new LogManager({ type: 'SYSTEM', name: 'DemoApp' }).addTransport(
        new ConsoleTransport('INFO')
    );

    logger.info('====================================================');
    logger.info('      SuperNova v0.3.1 Session & Agent Demo         ');
    logger.info('====================================================');
    logger.info('Bootstrapping runtime subsystems...');

    // 1. 初始化核心基礎設施
    const kernel = new Kernel();
    const eventBus = new EventBus();
    const configManager = new ConfigManager();

    // 2. 註冊子系統配置架構 (Storage, Agent, LLM)
    configManager.registerSection('storage', StorageSectionSchema, {
        ...DEFAULT_STORAGE_CONFIG,
        base_dir: './workspace',
        session_dir: 'sessions',
        profile_version: 'self'
    });

    configManager.registerSection('agent', AgentSectionSchema, {
        ...DEFAULT_AGENT_CONFIG,
        offload_threshold_new_message: 1000, // Demo 為了展示大資料卸載，設為 1,000 字元門檻
        temporal_threshold_ms: 60_000, // Demo 設為 1 分鐘展示時間插針
    });

    configManager.registerSection('llm', LLMSectionSchema, {
        default_preset: 'DEFAULT',
        embedding_model: 'text-embedding-3-small',
        embedding_provider: 'openai',
        presets: {
            DEFAULT: {
                provider: 'openai',
                modelName: 'gpt-5.6-luna',
                temperature: 1,
            },
        },
    });

    // 3. 載入或自動生成 ./config.yaml
    const configPath = './config.yaml';
    await configManager.load({
        filePath: configPath,
        generateIfMissing: true
    });

    // 提取聚合校驗後的強型別配置
    const storageConfig = configManager.get<StorageConfig>('storage');
    const agentConfig = configManager.get<AgentConfig>('agent');

    // 4. 初始化 LLMProvider
    const llmProvider = new LLMProvider(configManager);

    // 5. 初始化持久化儲存庫 (由 storageConfig 自行組裝 baseDir = base_dir + session_dir)
    const sessionRepo = new FileSystemSessionRepository({ storage: storageConfig });
    const dataBlockRepo = new FileSystemDataBlockRepository({
        storage: storageConfig,
        agent: agentConfig,
    });
    const profileRepo = new FileSystemProfileRepository({ storage: storageConfig });
    const graphRepo = new JsonGraphRepository({ storage: storageConfig });



    // 6. 註冊基礎服務進微核心
    kernel.registerService('events', eventBus);
    kernel.registerService('llm', llmProvider);
    kernel.registerService('config', configManager);

    // 7. 掛載三大核心外掛 (SessionManager, AgentManager, MessageRouter)
    const sessionManager = new SessionManager({
        eventBus,
        repository: sessionRepo,
    });
    const agentManager = new AgentManager();
    const messageRouter = new MessageRouter({
        eventBus,
        sessionManager,
        agentManager,
        agent: agentConfig,
    });

    await kernel.use(sessionManager);
    await kernel.use(agentManager);
    await kernel.use(messageRouter);

    // 8. 啟動微內核 (依序執行生命週期初始化與啟動)
    await kernel.boot();
    logger.info('Kernel booted successfully. State: RUNNING');

    // 9. 獲取或建立固定 ID 的展示用會話 (DEMO_SESSION_ID) 與 Agent
    const DEMO_AGENT_ID = 'nova-core';
    const DEMO_SESSION_ID = 'demo-session';

    let session = sessionManager.getSession(DEMO_SESSION_ID);
    if (!session) {
        try {
            // 先嘗試從儲存庫加載既有會話
            session = await sessionManager.loadSession(DEMO_SESSION_ID);
            logger.info(`Found and loaded existing session [${DEMO_SESSION_ID}] from repository.`);
        } catch {
            // 搜尋不到的話才重新創建
            session = sessionManager.createSession({
                id: DEMO_SESSION_ID,
                metadata: { name: 'CLI Interactive Sandbox', environment: 'terminal' },
            });
            logger.info(`Session not found. Created new session [${DEMO_SESSION_ID}].`);
        }
    } else {
        logger.info(`Found existing active session [${DEMO_SESSION_ID}] in memory pool.`);
    }

    // 確保會話處於 ACTIVE 狀態（若先前重啟為 PAUSED 或 SUSPENDED）
    if (session.status === SessionState.PAUSED) {
        session.resume();
        session.closeReason = undefined;
    }

    if (!session.hasParticipant(DEMO_AGENT_ID)) {
        session.registerParticipant(DEMO_AGENT_ID);
    }
    if (!session.hasParticipant('user')) {
        session.registerParticipant('user');
    }

    let agent = agentManager.getAgent(DEMO_AGENT_ID);
    if (!agent) {
        agent = agentManager.createAgent(DEMO_AGENT_ID, {
            sessionId: session.id,
            presetName: 'DEFAULT',
            maxSteps: 5,
        });
    }

    logger.info(`Session ready [${session.id}], Agent [${DEMO_AGENT_ID}] registered as participant.`);

    // 10. 掛載器官模組 1: HistoryModule (配置完全由 agentConfig 驅動)
    let historyModule = agent.getModule<HistoryModule>('history');
    if (!historyModule) {
        historyModule = new HistoryModule({
            repository: dataBlockRepo,
            sessionId: session.id,
            agent: agentConfig,
        });
        await agent.attachModule(historyModule);
    }

    // 11. 掛載器官模組 2: ProfileModule (自 workspace/profiles 載入專屬身份、性格與行為準則)
    let profileModule = agent.getModule<ProfileModule>('profile');
    if (!profileModule) {
        profileModule = ProfileModule.load('main_agent', { storage: storageConfig }, true, {
            sessionId: session.id,
            repository: profileRepo,
        });
        await agent.attachModule(profileModule);
    }

    // 12. 掛載器官模組 3: MemoryModule (長期知識圖譜、向量關聯檢索與 recall_memory 工具)
    let memoryModule = agent.getModule<MemoryModule>('memory');
    if (!memoryModule) {
        memoryModule = new MemoryModule({
            repository: graphRepo,
            sessionId: session.id,
            topK: 3,
        });
        await agent.attachModule(memoryModule);
    }

    // 13. 建立互動式終端讀取介面 (CLI)

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const showPrompt = () => {
        process.stdout.write('\nYou > ');
    };

    // 14. 監聽 EventBus 切面與會話訊息事件 (全非同步響應流)
    eventBus.subscribe(HookEvent.BeforeAgentRun, (e) => {
        process.stdout.write(`\n⚙️  [Agent Run] Thinking (${e.payload.agentId})...`);
    });

    eventBus.subscribe(HookEvent.AfterAgentRun, (e) => {
        const stats = agent.usageStats;
        if (stats && (stats.promptTokens > 0 || stats.durationMs > 0)) {
            console.log(
                `\n📊 [Usage Delta] Duration: ${stats.durationMs}ms | Tokens: ${stats.promptTokens + stats.completionTokens}`
            );
        }
    });

    eventBus.subscribe(HookEvent.BeforeToolCall, (e) => {
        console.log(`\n🔧 [Tool Invoking] ${e.payload.toolName}(${JSON.stringify(e.payload.args)})`);
    });

    eventBus.subscribe(HookEvent.AfterToolCall, (e) => {
        console.log(`✔️  [Tool Output]   ${JSON.stringify(e.payload.result)}`);
    });

    eventBus.subscribe(HookEvent.OnToolError, (e) => {
        console.log(`❌ [Tool Error]    ${e.payload.error}`);
    });

    // 攔截會話訊息：當收到 Agent 的對外發言 (AGENT_SEND) 時印出回應並提示使用者
    eventBus.subscribe(SessionEvent.SessionMessage, (e) => {
        if (e.payload.type === SessionMessageType.AgentSend) {
            const replyBlock = e.payload.message[0];
            const content = replyBlock?.controlPayload
            console.log(`\n🤖 Nova: ${content}`);
            showPrompt();
        } else if (e.payload.type === SessionMessageType.SystemNotice) {
            const noticeBlock = e.payload.message[0];
            console.log(`\n📢 [System Notice]: ${noticeBlock?.controlPayload}`);
        }
    });

    console.log('\n----------------------------------------------------');
    console.log('Available Commands:');
    console.log('  "help"         - Show guidance and sample queries');
    console.log('  "status"       - Display kernel, session, agent, and memory status');
    console.log('  "history"      - Inspect in-memory and disk trajectory');
    console.log('  "test-offload" - Inject massive payload (>1KB) to test Blob offloading');
    console.log('  "pause"        - Pause session (freeze autonomous wakeup)');
    console.log('  "resume"       - Resume session (unfreeze and process inbox)');
    console.log('  "save"         - Persist current session snapshot to disk');
    console.log('  "exit"         - Graceful shutdown of all subsystems');
    console.log('----------------------------------------------------');

    const promptUser = () => {
        rl.question('', async (input) => {
            const text = input.trim();

            if (!text) {
                showPrompt();
                promptUser();
                return;
            }

            if (text === 'exit' || text === 'quit') {
                logger.info('Initiating graceful system shutdown...');
                rl.close();
                await sessionManager.saveSession(session.id);
                await kernel.stop();
                logger.info('SuperNova terminated safely. Bye!');
                process.exit(0);
            }

            if (text === 'help') {
                console.log('\n[Available Demo Commands]');
                console.log('  - Type regular questions to chat with Agent.');
                console.log('  - Type "status"            -> Show Kernel & Session status.');
                console.log('  - Type "history"           -> Show active dialog memory & persisted trajectory.');
                console.log('  - Type "test-offload"      -> Test Large Payload Offload into Blob storage.');
                console.log('  - Type "pause"             -> Freeze session wakeup.');
                console.log('  - Type "resume"            -> Unfreeze session wakeup.');
                console.log('  - Type "save"              -> Persist session state to disk.');
                console.log('  - Type "exit"              -> Graceful shutdown.');
                showPrompt();
                promptUser();
                return;
            }

            if (text === 'status') {
                console.log('\n[System & Session Status]');
                console.log(`  Kernel State:      ${kernel.state}`);
                console.log(`  Session ID:        ${session.id}`);
                console.log(`  Session Status:    ${session.status}`);
                console.log(`  Participants:      ${Array.from(session.participantIds).join(', ')}`);
                console.log(`  Agent State:       ${agent.state}`);
                console.log(`  History Window:    ${historyModule.size} active messages`);
                console.log(`  Inbox Pending:     ${session.getInboxSize(DEMO_AGENT_ID)}`);
                const llmConfig = configManager.get<any>('llm');
                const presetInfo = llmConfig?.presets?.[agent.presetName];
                console.log(`  LLM Model:         ${presetInfo?.modelName || 'gpt-4o'} (${presetInfo?.provider || 'openai'})`);
                showPrompt();
                promptUser();
                return;
            }

            if (text === 'history') {
                const diskTrajectory = await dataBlockRepo.findByAgent(session.id, DEMO_AGENT_ID);
                console.log('\n[History Trajectory Inspection]');
                console.log(`  In-memory window size: ${historyModule.size}`);
                console.log(`  Persisted on disk:     ${diskTrajectory.length} blocks`);
                console.log('--- Last 3 Messages ---');
                const lastThree = historyModule.getMessages().slice(-3);
                lastThree.forEach((m, idx) => {
                    console.log(`  [${m._getType().toUpperCase()}]: ${typeof m.content === 'string' ? m.content.substring(0, 120) : JSON.stringify(m.content)}`);
                });
                showPrompt();
                promptUser();
                return;
            }

            if (text === 'test-offload') {
                console.log('\n📦 [Test Large Payload Offloading]');
                console.log('Generating massive payload (3,500 characters, exceeds 1,000 threshold)...');
                const hugeText =
                    '=== SUPERNOVA BIG DATA REPORT ===\n' +
                    'LogLine [METRICS_DATA_POINT]: ' +
                    'D'.repeat(3400) +
                    '\n=== END OF REPORT ===';

                const massiveBlock = new DataBlock({
                    sessionId: session.id,
                    senderId: 'user',
                    targetId: DEMO_AGENT_ID,
                    type: 'human',
                    intent: 'USER_INPUT',
                    controlPayload: hugeText,
                    priority: MessagePriority.HIGH,
                });

                eventBus.publish({
                    type: SessionEvent.SessionMessage,
                    timestamp: Date.now(),
                    sessionId: session.id,
                    payload: {
                        sessionId: session.id,
                        senderId: 'user',
                        targetId: DEMO_AGENT_ID,
                        type: SessionMessageType.UserInput,
                        intent: 'USER_INPUT',
                        message: [massiveBlock],
                    },
                });

                promptUser();
                return;
            }

            if (text === 'save') {
                await sessionManager.saveSession(session.id);
                console.log(`\n💾 Saved session [${session.id}] to [${sessionRepo.getBaseDir()}]`);
                showPrompt();
                promptUser();
                return;
            }

            if (text === 'pause') {
                sessionManager.pauseSession(session.id);
                console.log(
                    `\n⏸️  Session [${session.id}] is now PAUSED. Incoming messages will queue in inbox without waking agent.`
                );
                showPrompt();
                promptUser();
                return;
            }

            if (text === 'resume') {
                sessionManager.resumeSession(session.id);
                console.log(`\n▶️  Session [${session.id}] is now ACTIVE.`);
                // 若有積壓訊息，透過 MessageRouter 觸發派發
                await messageRouter.dispatchSessionInbox(session.id, DEMO_AGENT_ID);
                showPrompt();
                promptUser();
                return;
            }

            // 15. 一般使用者輸入：封裝為 DataBlock 並透過 SessionEvent.SessionMessage 發佈
            const userBlock = new DataBlock({
                sessionId: session.id,
                senderId: 'user',
                targetId: DEMO_AGENT_ID,
                type: 'human',
                intent: 'USER_INPUT',
                controlPayload: text,
                priority: MessagePriority.HIGH, // HIGH 優先度即刻觸發喚醒
            });

            // 廣播統一會話訊息事件，由 MessageRouter 自動路由與派發
            eventBus.publish({
                type: SessionEvent.SessionMessage,
                timestamp: Date.now(),
                sessionId: session.id,
                payload: {
                    sessionId: session.id,
                    senderId: 'user',
                    targetId: DEMO_AGENT_ID,
                    type: SessionMessageType.UserInput,
                    intent: 'USER_INPUT',
                    message: [userBlock],
                },
            });

            promptUser();
        });
    };

    // 啟動首輪提示
    showPrompt();
    promptUser();
}

// 捕獲例外安全退出
main().catch((err) => {
    console.error('Fatal crash in DemoApp:', err);
    process.exit(1);
});
