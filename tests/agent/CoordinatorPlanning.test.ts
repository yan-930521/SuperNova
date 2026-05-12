import { ModelRegistry, InferenceEngine } from '../../src/runtime/ModelRegistry';
import { AgentRegistry } from '../../src/infra/AgentRegistry';
import { CoordinatorAgent } from '../../src/agent/CoordinatorAgent';
import { ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { ChatOpenAI } from '@langchain/openai';

describe('Coordinator Planning Integration (Real Inference)', () => {
  let agentRegistry: AgentRegistry;
  let modelRegistry: ModelRegistry;

  beforeAll(() => {
    // 檢查環境變數
    if (!process.env.OPENAI_API_KEY) {
      console.warn('Skipping Real Inference Test: OPENAI_API_KEY not found.');
      return;
    }

    modelRegistry = new ModelRegistry();
    
    // 初始化真實模型
    const smartModel = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 });
    const evalModel = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });

    modelRegistry.registerModel(ModelPreset.SMART, new InferenceEngine(smartModel));
    modelRegistry.registerModel(ModelPreset.EVAL, new InferenceEngine(evalModel));

    agentRegistry = new AgentRegistry(modelRegistry);
  });

  it('should generate a valid runtime TaskGraph from a high-level goal', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return; // Skip
    }

    const coordinator = await agentRegistry.loadAgentFromJSON({
      id: 'coord-test',
      type: 'COORDINATOR',
      role: 'Project Planner'
    }) as CoordinatorAgent;

    const goal = "I want to research the latest trends in renewable energy and write a summary report.";
    
    // 執行規劃 (這會發起真實的 AI 請求)
    console.log("Sending real planning request to LLM...");
    const runtimeGraph = await coordinator.planTaskGraph(goal);

    // 驗證轉換後的數據結構
    expect(runtimeGraph.nodes).toBeDefined();
    expect(runtimeGraph.nodes.length).toBeGreaterThan(0);
    expect(runtimeGraph.adjList).toBeDefined();
    expect(runtimeGraph.inDegreeMap).toBeDefined();

    // 檢查拓撲邏輯
    const nodeIds = runtimeGraph.nodes.map(([id]: [string, any]) => id);
    runtimeGraph.adjList.forEach(([parentId, successors]: [string, string[]]) => {
      expect(nodeIds).toContain(parentId);
      successors.forEach(childId => expect(nodeIds).toContain(childId));
    });

    console.log("Generated Tasks:", runtimeGraph.nodes.map(([id, meta]: [string, any]) => `${id}: ${meta.goal}`));
  }, 30000); // 設置 30 秒超時，因為 AI 推理較慢
});
