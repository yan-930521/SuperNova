import * as fs from 'fs';

import { ConfigLoader } from '../src/core/config/ConfigLoader';
import { LLMProvider } from '../src/core/infra/llm/LLMProvider';
import { LATSPlanner } from '../src/core/task/planning/LATSPlanner';
import { TaskDAGGenerator } from '../src/core/task/planning/TaskDAGGenerator';

async function runDemo() {
    console.log("==========================================");
    console.log("  Starting LATS Task Planning Demo");
    console.log("==========================================\n");

    // 1. 初始化 Config 與 LLMProvider
    // 每次執行 demo 前刪除舊的 config.yaml，強制使用預設值

    const configPath = './config.yaml';
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
    }

    const loader = new ConfigLoader();
    const config = await loader.bootstrap(configPath);

    const llmProvider = new LLMProvider(config);
    await llmProvider.initialize();

    const planner = new LATSPlanner(llmProvider);
    const generator = new TaskDAGGenerator(llmProvider);

    const objective = "開發一個簡單的加密貨幣追蹤工具。需要先從外部 API 獲取比特幣與以太幣的最新價格，然後計算這兩者的價差，最後將結果儲存成一個 HTML 報告檔案。";
    const context = "這是一個在本地環境執行的腳本工具，沒有任何前端框架。";

    console.log(`\nObjective: ${objective}`);
    console.log(`Context: ${context}\n`);

    // 2. 執行 LATS 搜尋 (兩種模式都跑一次)
    const iterations = config.task.mcts_max_iterations || 3;

    async function runSearch(mode: 'holistic' | 'step_by_step') {
        console.log(`\n==========================================`);
        console.log(` Running LATS Strategy Search (Mode: ${mode})`);
        console.log(`==========================================\n`);
        
        const startTime = Date.now();
        const bestStrategy = await planner.search({
            objective,
            context,
            maxIterations: iterations,
            mode,
            scoringCriteria: '特別注重錯誤處理 (Error Handling) 與邊界情況 (Edge cases)',
            expansionHint: '請把焦點放在「如果外部 API 斷線或回傳不合理的數值時」該如何設計流程'
        });
        const latsTime = Date.now() - startTime;

        console.log(`\n[${mode.toUpperCase()} Final Strategy Trajectory]`);
        console.log("------------------------------------------");
        console.log(bestStrategy);
        console.log("------------------------------------------");
        console.log(`LATS Search took ${latsTime}ms\n`);

        console.log(`Translating ${mode} Strategy into TaskDAG...`);
        const genStartTime = Date.now();
        const dag = await generator.generate(bestStrategy);
        const genTime = Date.now() - genStartTime;

        console.log(`\n[${mode.toUpperCase()} Generated TaskDAG JSON]`);
        console.log("------------------------------------------");
        console.log(JSON.stringify(dag, null, 2));
        console.log("------------------------------------------");
        console.log(`DAG Translation took ${genTime}ms\n`);
    }

    // 分別測試兩種模式
    // await runSearch('holistic');
    await runSearch('step_by_step');

    console.log("Demo Finished successfully.");
    process.exit(0);
}

runDemo().catch(err => {
    console.error("Demo failed:", err);
    process.exit(1);
});