import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { LLMProvider, LLMSectionSchema } from '@supernova/common/llm';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { EventBus } from '@supernova/events/EventBus';
import { ConfigManager, Kernel } from '@supernova/runtime';

import {
    AgentManager, FileSystemProfileRepository, HistoryModule, JsonGraphRepository, MemoryModule,
    ProfileModule
} from '../src/core';
import {
    AgentConfig, AgentSectionSchema, DEFAULT_AGENT_CONFIG, DEFAULT_STORAGE_CONFIG, StorageConfig,
    StorageSectionSchema
} from '../src/core/config';
import { FileSystemDataBlockRepository, MessageRouter } from '../src/core/messaging';
import { FileSystemSessionRepository, SessionManager } from '../src/core/session';

dotenvConfig();

/**
 * SuperNova V2 - 知識圖譜記憶與向量語意檢索展示程序 (Memory & Knowledge Graph Demo)
 *
 * 完整展示：
 * 1. 現代化微內核 (Kernel) 與多模型預設工廠 (LLMProvider)
 * 2. 長期記憶器官 (MemoryModule) 對話自動語意抽取與三元組生成
 * 3. 實體節點 (Nodes)、關係邊 (Edges) 與 Vectra 本地向量索引庫之持久化
 * 4. 向量相似度搜尋與一階/多階子圖拓撲展開 (searchGraphContext)
 * 5. 模型推理時主動回想工具 (recall_memory) 之調用與格式化輸出
 */
async function main() {
    const logger = new LogManager({ type: 'SYSTEM', name: 'MemoryDemo' }).addTransport(
        new ConsoleTransport('INFO')
    );

    console.log('================================================================');
    console.log('       SuperNova V2 - Knowledge Graph Memory & Vector Demo       ');
    console.log('================================================================');
    logger.info('Initializing runtime environment and memory subsystems...');

    // 1. 初始化核心基礎設施
    const kernel = new Kernel();
    const eventBus = new EventBus();
    const configManager = new ConfigManager();

    // 2. 註冊配置區段 (Storage, Agent, LLM)
    configManager.registerSection('storage', StorageSectionSchema, {
        ...DEFAULT_STORAGE_CONFIG,
        base_dir: './workspace',
        session_dir: 'sessions',
        profile_version: 'self',
    });

    configManager.registerSection('agent', AgentSectionSchema, {
        ...DEFAULT_AGENT_CONFIG,
    });

    configManager.registerSection('llm', LLMSectionSchema, {
        default_preset: 'DEFAULT',
        embedding_model: 'text-embedding-3-small',
        embedding_provider: 'openai',
        presets: {
            DEFAULT: {
                provider: 'openai',
                modelName: 'gpt-5.6-luna',
                temperature: 0.2,
            },
            extraction: {
                provider: 'openai',
                modelName: 'gpt-5.6-luna',
                temperature: 0.1,
                maxTokens: 8192,
                reasoning: {
                    effort: "none"
                },
                parallel_tool_calls: true,
                service_tier: "flex"
            },
        },
    });

    // 載入配置 (若 config.yaml 存在則載入，否則自動生成)
    const configPath = './config.yaml';
    await configManager.load({
        filePath: configPath,
        generateIfMissing: true,
    });

    const storageConfig = configManager.get<StorageConfig>('storage');
    const agentConfig = configManager.get<AgentConfig>('agent');

    // 3. 初始化 LLMProvider 與外部持久化倉儲單例
    const llmProvider = new LLMProvider(configManager);

    const sessionRepo = new FileSystemSessionRepository({ storage: storageConfig });
    const dataBlockRepo = new FileSystemDataBlockRepository({
        storage: storageConfig,
        agent: agentConfig,
    });
    const profileRepo = new FileSystemProfileRepository({ storage: storageConfig });
    const graphRepo = new JsonGraphRepository({ storage: storageConfig });

    // 4. 註冊微內核服務與核心外掛
    kernel.registerService('events', eventBus);
    kernel.registerService('llm', llmProvider);
    kernel.registerService('config', configManager);

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

    // 啟動內核
    await kernel.boot();
    logger.info('Runtime Kernel booted successfully.');

    // 5. 建立專屬展示 Session 與 Agent
    const SESSION_ID = `test-memory-${Date.now()}`;
    const AGENT_ID = 'nova-brain';

    const session = sessionManager.createSession({
        id: SESSION_ID,
    });
    session.registerParticipant(AGENT_ID);
    session.registerParticipant('user');

    const agent = agentManager.createAgent(AGENT_ID, {
        sessionId: session.id,
        presetName: 'DEFAULT',
    });

    // 依序掛載 ProfileModule, HistoryModule 與 MemoryModule 器官
    const profileModule = ProfileModule.load('main_agent', { storage: storageConfig }, false, {
        sessionId: session.id,
        repository: profileRepo,
    });
    await agent.attachModule(profileModule);

    const historyModule = new HistoryModule({
        repository: dataBlockRepo,
        sessionId: session.id,
        agent: agentConfig,
    });
    await agent.attachModule(historyModule);

    const memoryModule = new MemoryModule({
        repository: graphRepo,
        sessionId: session.id,
        extractionPresetName: 'extraction',
        topK: 3,
        subgraphDepth: 1,
    });
    await agent.attachModule(memoryModule);

    console.log(`\n✨ Session & Agent Initialized:`);
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Agent ID:   ${agent.id}`);
    console.log(`   Attached Modules: profile, history, memory`);

    // ─────────────────────────────────────────────────────────────
    // Phase 1: 注入對話文本並執行圖譜記憶萃取
    // ─────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('  Phase 1: Knowledge Graph Memory Extraction (實體三元組萃取)    ');
    console.log('================================================================');

    const simulatedConversation = [
        'User: 你好，我是 Yan。我正在開發 SuperNova，這是一個以 TypeScript 和 Bun 為核心的自主多代理人作業系統。',
        'Agent: 你好 Yan！SuperNova 聽起來是個架構嚴謹的高併發系統，Bun 和 TypeScript 提供了絕佳的效能與型別安全！',
        'User: 沒錯！我非常注重架構與型別安全，因此在 SuperNova 裡全面導入 Zod 與嚴格型別，我個人非常討厭沒有型別檢查的語言（例如原生 Python）。',
    ].join('\n');

    console.log('Simulated Conversation Input:');
    console.log('----------------------------------------------------------------');
    console.log(simulatedConversation);
    console.log('----------------------------------------------------------------');

    console.log('\n[Triggering] Extracting entities and relations via LLM & Vectra embeddings...');
    const startTime = Date.now();
    await memoryModule.extractMemory(simulatedConversation, session.id);
    const durationMs = Date.now() - startTime;
    console.log(`✔️  Extraction & Embedding completed in ${durationMs}ms!`);

    // ─────────────────────────────────────────────────────────────
    // Phase 2: 驗證圖譜持久化與知識拓撲結構
    // ─────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('  Phase 2: Graph Persistence & Topology Inspection (圖譜結構檢查) ');
    console.log('================================================================');

    const nodes = await graphRepo.listNodes(session.id);
    const edges = await graphRepo.listEdges(session.id);

    console.log(`\n📌 Extracted Knowledge Nodes (${nodes.length}):`);
    for (const node of nodes) {
        console.log(`  - [${node.label.padEnd(12)}] ${node.id.padEnd(20)} : ${node.memory}`);
    }

    console.log(`\n🔗 Extracted Relational Edges (${edges.length}):`);
    for (const edge of edges) {
        console.log(`  - (${edge.sourceId}) --[${edge.relation}]--> (${edge.targetId})`);
    }

    const sessionGraphDir = path.join(
        storageConfig.base_dir,
        storageConfig.session_dir,
        session.id,
        storageConfig.graph_dir
    );
    console.log(`\n📁 Graph Storage Directory: ${sessionGraphDir}`);
    console.log(`   - Nodes File:       ${storageConfig.graph_nodes_file} (${fs.existsSync(path.join(sessionGraphDir, storageConfig.graph_nodes_file)) ? 'EXISTS' : 'NOT FOUND'})`);
    console.log(`   - Edges File:       ${storageConfig.graph_edges_file} (${fs.existsSync(path.join(sessionGraphDir, storageConfig.graph_edges_file)) ? 'EXISTS' : 'NOT FOUND'})`);
    console.log(`   - Vectra Vector DB: index/ (${fs.existsSync(path.join(sessionGraphDir, 'index')) ? 'EXISTS' : 'NOT FOUND'})`);

    // ─────────────────────────────────────────────────────────────
    // Phase 3: 語意向量檢索與子圖拓撲展開 (Vector Subgraph Search)
    // ─────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('  Phase 3: Semantic Vector Search & Subgraph Retrieval (語意檢索) ');
    console.log('================================================================');

    const testQueries = [
        'Yan 討厭什麼？',
        'SuperNova 的技術架構與核心語言是什麼？',
    ];

    const embeddings = llmProvider.getEmbeddings();

    for (const query of testQueries) {
        console.log(`\n🔎 Query: "${query}"`);
        const queryVector = await embeddings.embedQuery(query);
        const searchResult = await graphRepo.searchGraphContext(session.id, queryVector, 3, 1);

        console.log(`   Retrieved ${searchResult.nodes.length} nodes, ${searchResult.edges.length} edges:`);
        for (const n of searchResult.nodes) {
            console.log(`     * Node: [${n.label}] ${n.id} -> ${n.memory}`);
        }
        for (const e of searchResult.edges) {
            console.log(`     * Edge: (${e.sourceId}) -[${e.relation}]-> (${e.targetId})`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Phase 4: Agent 主動召回工具驗證 (recall_memory Tool)
    // ─────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('  Phase 4: Agent recall_memory Tool Invocation (工具回想驗證)     ');
    console.log('================================================================');

    const tools = memoryModule.getTools();
    const recallTool = tools.find((t) => t.name === 'recall_memory');

    if (recallTool) {
        console.log(`Tool registered: ${recallTool.name} - ${recallTool.description}`);
        const toolQuery = 'Yan 與 SuperNova 的相關資訊';
        console.log(`\n🤖 Simulating Agent invoking recall_memory({ query: "${toolQuery}" })...`);

        const toolResult = await recallTool.func({ query: toolQuery, limit: 3 });
        console.log('\n[Tool Markdown Output]:');
        console.log('----------------------------------------------------------------');
        console.log(toolResult);
        console.log('----------------------------------------------------------------');
    } else {
        console.log('⚠️ recall_memory tool not found in MemoryModule!');
    }

    // ─────────────────────────────────────────────────────────────
    // Phase 5: 優雅停機
    // ─────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('  Phase 5: Graceful Shutdown (優雅停機)                         ');
    console.log('================================================================');
    logger.info('Stopping runtime kernel and closing resources...');
    await kernel.stop();
    logger.info('SuperNova memory demo completed successfully.');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Demo encountered an unhandled error:', err);
    process.exit(1);
});


/*
================================================================
       SuperNova V2 - Knowledge Graph Memory & Vector Demo       
================================================================

.
.
.

✨ Session & Agent Initialized:
   Session ID: test-memory-1790177120479
   Agent ID:   nova-brain
   Attached Modules: profile, history, memory

================================================================
  Phase 1: Knowledge Graph Memory Extraction (實體三元組萃取)    
================================================================
Simulated Conversation Input:
----------------------------------------------------------------
User: 你好，我是 Yan。我正在開發 SuperNova，這是一個以 TypeScript 和 Bun 為核心的自主多代理人作業系統。
Agent: 你好 Yan！SuperNova 聽起來是個架構嚴謹的高併發系統，Bun 和 TypeScript 提供了絕佳的效能與型別安全！
User: 沒錯！我非常注重架構與型別安全，因此在 SuperNova 裡全面導入 Zod 與嚴格型別，我個人非常討厭沒有型別檢查的語言（例如原生 Python）。
----------------------------------------------------------------

[Triggering] Extracting entities and relations via LLM & Vectra embeddings...
[15:25:20] [DEBUG] [SYSTEM] [LLMProvider] Cached new BaseChatModel instance for preset [extraction]
✔️  Extraction & Embedding completed in 32312ms!

================================================================
  Phase 2: Graph Persistence & Topology Inspection (圖譜結構檢查) 
================================================================

📌 Extracted Knowledge Nodes (9):
  - [PERSON      ] User                 : 名為 Yan 的使用者，正在開發 SuperNova，重視架構與型別安全。
  - [PERSON      ] Yan                  : 使用者自稱的名字。
  - [TECHNOLOGY  ] SuperNova            : 以 TypeScript 和 Bun 為核心的自主多代理人作業系統。
  - [TECHNOLOGY  ] TypeScript           : SuperNova 使用的具型別檢查程式語言。
  - [TECHNOLOGY  ] Bun                  : SuperNova 使用的 JavaScript 執行環境與工具鏈。
  - [TECHNOLOGY  ] Zod                  : SuperNova 中用於資料驗證與型別安全的函式庫。
  - [TECHNOLOGY  ] Python               : 使用者不喜歡缺乏型別檢查的原生 Python。
  - [CONCEPT     ] 型別安全                 : 使用者在 SuperNova 架構中重視的軟體工程特性。
  - [CONCEPT     ] 自主多代理人作業系統           : SuperNova 所屬的系統類型。

🔗 Extracted Relational Edges (9):
  - (User) --[is_named]--> (Yan)
  - (User) --[is_developing]--> (SuperNova)
  - (SuperNova) --[uses]--> (TypeScript)
  - (SuperNova) --[uses]--> (Bun)
  - (SuperNova) --[is_a]--> (自主多代理人作業系統)
  - (User) --[values]--> (型別安全)
  - (SuperNova) --[uses]--> (Zod)
  - (SuperNova) --[implements]--> (型別安全)
  - (User) --[dislikes]--> (Python)

📁 Graph Storage Directory: workspace\sessions\test-memory-1790177120479\graph
   - Nodes File:       nodes.json (EXISTS)
   - Edges File:       edges.json (EXISTS)
   - Vectra Vector DB: index/ (EXISTS)

================================================================
  Phase 3: Semantic Vector Search & Subgraph Retrieval (語意檢索) 
================================================================

🔎 Query: "Yan 討厭什麼？"
   Retrieved 9 nodes, 9 edges:
     * Node: [PERSON] Yan -> 使用者自稱的名字。
     * Node: [PERSON] User -> 名為 Yan 的使用者，正在開發 SuperNova，重視架構與型別安全。
     * Node: [TECHNOLOGY] SuperNova -> 以 TypeScript 和 Bun 為核心的自主多代理人作業系統。
     * Node: [CONCEPT] 型別安全 -> 使用者在 SuperNova 架構中重視的軟體工程特性。
     * Node: [TECHNOLOGY] Python -> 使用者不喜歡缺乏型別檢查的原生 Python。
     * Node: [TECHNOLOGY] TypeScript -> SuperNova 使用的具型別檢查程式語言。
     * Node: [TECHNOLOGY] Bun -> SuperNova 使用的 JavaScript 執行環境與工具鏈。
     * Node: [CONCEPT] 自主多代理人作業系統 -> SuperNova 所屬的系統類型。
     * Node: [TECHNOLOGY] Zod -> SuperNova 中用於資料驗證與型別安全的函式庫。
     * Edge: (User) -[is_named]-> (Yan)
     * Edge: (User) -[is_developing]-> (SuperNova)
     * Edge: (User) -[values]-> (型別安全)
     * Edge: (User) -[dislikes]-> (Python)
     * Edge: (SuperNova) -[uses]-> (TypeScript)
     * Edge: (SuperNova) -[uses]-> (Bun)
     * Edge: (SuperNova) -[is_a]-> (自主多代理人作業系統)
     * Edge: (SuperNova) -[uses]-> (Zod)
     * Edge: (SuperNova) -[implements]-> (型別安全)

🔎 Query: "SuperNova 的技術架構與核心語言是什麼？"
   Retrieved 9 nodes, 9 edges:
     * Node: [TECHNOLOGY] SuperNova -> 以 TypeScript 和 Bun 為核心的自主多代理人作業系統。
     * Node: [PERSON] User -> 名為 Yan 的使用者，正在開發 SuperNova，重視架構與型別安全。
     * Node: [TECHNOLOGY] TypeScript -> SuperNova 使用的具型別檢查程式語言。
     * Node: [TECHNOLOGY] Bun -> SuperNova 使用的 JavaScript 執行環境與工具鏈。
     * Node: [CONCEPT] 自主多代理人作業系統 -> SuperNova 所屬的系統類型。
     * Node: [TECHNOLOGY] Zod -> SuperNova 中用於資料驗證與型別安全的函式庫。
     * Node: [CONCEPT] 型別安全 -> 使用者在 SuperNova 架構中重視的軟體工程特性。
     * Node: [PERSON] Yan -> 使用者自稱的名字。
     * Node: [TECHNOLOGY] Python -> 使用者不喜歡缺乏型別檢查的原生 Python。
     * Edge: (User) -[is_developing]-> (SuperNova)
     * Edge: (SuperNova) -[uses]-> (TypeScript)
     * Edge: (SuperNova) -[uses]-> (Bun)
     * Edge: (SuperNova) -[is_a]-> (自主多代理人作業系統)
     * Edge: (SuperNova) -[uses]-> (Zod)
     * Edge: (SuperNova) -[implements]-> (型別安全)
     * Edge: (User) -[values]-> (型別安全)
     * Edge: (User) -[is_named]-> (Yan)
     * Edge: (User) -[dislikes]-> (Python)

================================================================
  Phase 4: Agent recall_memory Tool Invocation (工具回想驗證)     
================================================================
Tool registered: recall_memory - Search long-term memory and knowledge graph for facts, user preferences, and historical entities.

🤖 Simulating Agent invoking recall_memory({ query: "Yan 與 SuperNova 的相關資訊" })...

[Tool Markdown Output]:
----------------------------------------------------------------
# Long-Term Knowledge Graph Memory
## Relevant Entities:
- [PERSON] User: 名為 Yan 的使用者，正在開發 SuperNova，重視架構與型別安全。
- [PERSON] Yan: 使用者自稱的名字。
- [TECHNOLOGY] SuperNova: 以 TypeScript 和 Bun 為核心的自主多代理人作業系統。
- [CONCEPT] 型別安全: 使用者在 SuperNova 架構中重視的軟體工程特性。
- [TECHNOLOGY] Python: 使用者不喜歡缺乏型別檢查的原生 Python。
- [CONCEPT] 自主多代理人作業系統: SuperNova 所屬的系統類型。
- [TECHNOLOGY] Bun: SuperNova 使用的 JavaScript 執行環境與工具鏈。
## Semantic Relations:
- (User) -[is_named]-> (Yan)
- (User) -[is_developing]-> (SuperNova)
- (User) -[values]-> (型別安全)
- (User) -[dislikes]-> (Python)
- (SuperNova) -[is_a]-> (自主多代理人作業系統)
- (SuperNova) -[uses]-> (Bun)
----------------------------------------------------------------

*/