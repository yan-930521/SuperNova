import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigLoader } from '../src/core/config/ConfigLoader';
import {
    FileSystemDataBlockRepository
} from '../src/core/infra/persistence/repository/FileSystemDataBlockRepository';
import { JsonGraphRepository } from '../src/core/infra/persistence/repository/JsonGraphRepository';
import { RuntimeKernel } from '../src/core/lifecycle/RuntimeKernel';
import { MemoryManager } from '../src/core/memory/MemoryManager';
import { DataBlock, MessagePriority } from '../src/core/messaging/DataBlock';

dotenvConfig();

async function main() {
    console.log('=============================================');
    console.log('   SuperNova v0.1.0 - Memory & Embedding Demo');
    console.log('=============================================');
    console.log('Initializing system...');

    const loader = new ConfigLoader();
    const config = await loader.bootstrap('./config.yaml');
    


    const kernel = new RuntimeKernel(config);

    // 啟動內核
    await kernel.initialize();
    await kernel.start();

    const container = kernel.getContainer();
    const memoryManager = container.resolve<MemoryManager>('MemoryManager');
    const dataBlockRepo = container.resolve<FileSystemDataBlockRepository>('DataBlockRepository');
    const graphRepo = container.resolve<JsonGraphRepository>('GraphRepository');

    // 建立一個全新的測試 Session
    const SESSION_ID = 'test-memory-session-' + Date.now();
    const AGENT_ID = 'main';

    console.log(`\n[Test] Created new session: ${SESSION_ID}`);

    // 清理舊資料夾 (防萬一)
    const sessionDir = path.join(process.cwd(), config.storage.base_dir, config.storage.session_dir, SESSION_ID);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    console.log('\n[Test] Injecting simulated conversation...');

    // 模擬一段對話
    const chatLog = [
        { role: 'human', text: '你好，我叫 Yan，我最近在開發一個叫做 SuperNova 的 AI 專案，使用的語言是 TypeScript。' },
        { role: 'ai', text: '你好 Yan！聽起來很酷。SuperNova 是一個什麼樣的專案呢？' },
        { role: 'human', text: '它是一個高併發的 Agent 運行時系統，底層使用 Bun 引擎，支援多代理人協作。我還幫它加上了記憶體防 OOM 機制。' },
        { role: 'ai', text: '這技術棧非常現代化！Bun 的效能極佳，而且支援原生的 TypeScript，確實非常適合用來打造底層系統。' },
        { role: 'human', text: '對了，我非常討厭用 Python 寫後端，我覺得型別不夠安全。' }
    ];

    const blocks: DataBlock<any>[] = [];
    for (let i = 0; i < chatLog.length; i++) {
        const msg = chatLog[i];
        blocks.push(new DataBlock({
            sessionId: SESSION_ID,
            senderId: msg.role === 'human' ? 'user' : AGENT_ID,
            targetId: msg.role === 'human' ? AGENT_ID : 'user',
            type: msg.role as any,
            priority: MessagePriority.NORMAL,
            controlPayload: msg.text
        }));
    }

    // 寫入 DataBlockRepo
    await dataBlockRepo.saveForAgent(SESSION_ID, AGENT_ID, blocks);
    console.log(`[Test] Saved ${blocks.length} messages to DataBlockRepository.`);

    console.log('\n[Test] Triggering Graph Memory Extraction (Phase 1: Extraction & Embeddings)...');
    console.log('This will call OpenAI API. Please wait...');
    
    // 手動觸發 MemoryManager 的圖譜萃取
    const startTime = Date.now();
    await memoryManager.extractAndSaveSessionMemory(SESSION_ID, AGENT_ID, "Yan");
    const duration = Date.now() - startTime;
    
    console.log(`\n[Test] Extraction Completed in ${duration}ms!`);

    console.log('\n[Test] Validating Graph Repository output:');
    
    // 讀取並打印結果
    // 因為 GraphRepository 有快取，而且我們剛寫進去，我們可以直接用內建方法查
    // 這裡我們直接掃 GraphRepo 的快取或檔案來看 Nodes & Edges
    const nodesFile = path.join(sessionDir, config.storage.graph_dir, config.storage.graph_nodes_file);
    const edgesFile = path.join(sessionDir, config.storage.graph_dir, config.storage.graph_edges_file);

    if (fs.existsSync(nodesFile)) {
        const nodesData = JSON.parse(fs.readFileSync(nodesFile, 'utf-8'));
        console.log(`\n📌 成功萃取了 ${nodesData.length} 個知識節點 (Nodes):`);
        for (const node of nodesData) {
            const embedStr = node.embedding && node.embedding.length > 0 
                ? `[Vector Array: ${node.embedding.length} dims]` 
                : '[NO EMBEDDING]';
            console.log(`  - 實體: ${node.id.padEnd(25)} | 記憶: ${node.memory.padEnd(20)} | 向量: ${embedStr}`);
        }
    } else {
        console.log('⚠️ 找不到 Nodes 檔案！萃取可能失敗了。');
    }

    if (fs.existsSync(edgesFile)) {
        const edgesData = JSON.parse(fs.readFileSync(edgesFile, 'utf-8'));
        console.log(`\n🔗 成功萃取了 ${edgesData.length} 條關係邊 (Edges):`);
        for (const edge of edgesData) {
            console.log(`  - ${edge.sourceId} --[${edge.relation}]--> ${edge.targetId}`);
        }
    } else {
        console.log('⚠️ 找不到 Edges 檔案！');
    }

    console.log('\n[Test] Shutting down kernel...');
    await kernel.stop();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
