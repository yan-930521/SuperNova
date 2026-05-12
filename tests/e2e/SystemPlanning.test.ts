import * as dotenv from 'dotenv';
import { CoordinatorAgent } from '../../src/agent/CoordinatorAgent';
import { TaskPlanEngine } from '../../src/agent/TaskPlanEngine';
import { ModelRegistry, InferenceEngine } from '../../src/runtime/ModelRegistry';
import { ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// 載入 .env 檔案中的環境變數
dotenv.config();

describe('System-Level Integration: Planning Flow (Real LLM)', () => {
  let modelRegistry: ModelRegistry;
  let planEngine: TaskPlanEngine;
  let coordinator: CoordinatorAgent;

  beforeEach(async () => {
    // 1. 檢查 API Key
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[SystemTest] OPENAI_API_KEY is not set. This test might fail.");
    }

    // 2. 設置真實 LLM 環境 (使用 gpt-4o-mini 以平衡速度與成本)
    const realModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0
    });
    
    const inferenceEngine = new InferenceEngine(realModel as any);
    
    modelRegistry = new ModelRegistry();
    modelRegistry.registerModel(ModelPreset.SMART, inferenceEngine);
    modelRegistry.registerModel(ModelPreset.EVAL, inferenceEngine);

    // 3. 初始化核心組件
    planEngine = new TaskPlanEngine(modelRegistry);
    coordinator = new CoordinatorAgent(planEngine);
    await coordinator.initFromJSON({
      id: "coordinator-1",
      role: "COORDINATOR"
    });
  });

  it('should take a goal and produce a full task graph using real LLM', async () => {
    const goal = "Build a simple weather CLI tool in Node.js";
    
    console.log(`[SystemTest] Starting real planning for: ${goal}`);
    
    // 4. 執行規劃
    const runtimeGraph = await coordinator.planTaskGraph(goal);

    // 5. 驗證輸出
    expect(runtimeGraph).toBeDefined();
    expect(runtimeGraph.nodes.length).toBeGreaterThan(0);
    expect(runtimeGraph.adjList.length).toBeGreaterThan(0);

    console.log("[SystemTest] Planning successful. Full Task Graph:");
    console.log(JSON.stringify(runtimeGraph, null, 2));

    // 驗證生成的任務是否合理
    expect(runtimeGraph.nodes.some((n: any) => n[1].goal.toLowerCase().includes("api") || n[1].goal.toLowerCase().includes("weather"))).toBe(true);
  }, 60000); // 延長超時時間至 60 秒以應對真實網路請求
});
