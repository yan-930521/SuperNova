import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BaseSession } from '../src/session/BaseSession';
import { FileSnapshotManager } from '../src/infra/FileSnapshotManager';
import { AgentRegistry } from '../src/infra/AgentRegistry';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import { SessionManager } from '../src/infra/SessionManager';
import { EventBus } from '../src/infra/EventBus';
import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { BaseAgent } from '../src/agent/BaseAgent';
import { WorkerAgent } from '../src/agent/WorkerAgent';
import { CoordinatorAgent } from '../src/agent/CoordinatorAgent';
import { TaskPlanEngine } from '../src/agent/TaskPlanEngine';
import { ModelRegistry, InferenceEngine } from '../src/runtime/ModelRegistry';
import { ModelPreset } from '../interfaces/runtime/IModelRegistry';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../src/tool/BaseTool';
import type { ITool, ToolSafetyTier } from '../interfaces/tool/ITool';
import type { IToolContext } from '../interfaces/tool/IToolContext';

dotenv.config();

// ==========================================
// Mocks for Integration Tests
// ==========================================

class MockTool extends BaseTool {
  constructor(name: string, type: string, safety: ToolSafetyTier = 'TIER_1') {
    super(name, `Mock ${type}`, safety, [type.toUpperCase()]);
  }
  async run(input: any) {
    if (JSON.stringify(input).toLowerCase().includes('forbidden.txt')) {
      throw new Error("Permission denied");
    }
    return { status: "success", result: "mocked" };
  }
}

describe('Integration & E2E Theme Tests', () => {

  describe('Snapshot & Rollback Integration', () => {
    const testStorageDir = path.join(process.cwd(), '.test-integration-snapshots-theme');
    let snapshotManager: FileSnapshotManager;
    let agentRegistry: AgentRegistry;
    let toolRegistry: ToolRegistry;

    beforeEach(async () => {
      snapshotManager = new FileSnapshotManager(testStorageDir);
      toolRegistry = new ToolRegistry();
      agentRegistry = new AgentRegistry(undefined, toolRegistry);
      if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
        await fs.rm(testStorageDir, { recursive: true, force: true });
      }
    });

    afterAll(async () => {
      if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
        await fs.rm(testStorageDir, { recursive: true, force: true });
      }
    });

    it('should auto-snapshot and support manual rollback with agent state', async () => {
      const session = new BaseSession('test-session', 'Initial Goal');
      session.snapshotManager = snapshotManager;
      session.agentRegistry = agentRegistry;

      toolRegistry.register(new MockTool('test', 'test'));

      const agent = new BaseAgent();
      await agent.initFromJSON({ id: 'agent-1', role: 'worker', state: { step: 0 } });
      agentRegistry.register(agent);
      session.addAgent('agent-1');

      session.taskGraph.addTask('Task1', { type: 'test', goal: 'A', metadata: { data: 'A' } });
      session.taskGraph.addTask('Task2', { type: 'test', goal: 'B', metadata: { data: 'B' } });
      session.taskGraph.addDependency('Task1', 'Task2');

      await session.tick();
      expect(session.taskGraph.getReadyTasks()).toEqual(['Task2']);
      const snapshotId = await snapshotManager.getLatestSnapshotId('test-session');

      await agent.initFromJSON({ state: { step: 1, corrupted: true } });
      session.status = 'ERROR';
      
      await session.rollback(snapshotId!);

      expect(session.status).toBe('IDLE');
      expect(session.taskGraph.getReadyTasks()).toEqual(['Task2']);
      const restoredJson = (agentRegistry.getAgent('agent-1') as BaseAgent).toJSON();
      expect(restoredJson.state.corrupted).toBeUndefined();
      expect(restoredJson.state.step).toBe(0);
    });
  });

  describe('Full Execution Loop (Mocked)', () => {
    it('should execute tasks in DAG order through GlobalRuntime', async () => {
      jest.useFakeTimers();
      const eventBus = new EventBus();
      const toolRegistry = new ToolRegistry();
      const agentRegistry = new AgentRegistry(undefined, toolRegistry);
      const sessionManager = new SessionManager();
      const runtime = new GlobalRuntime(sessionManager, eventBus);
      runtime.config = { runtime: { tick_rate_ms: 100, max_active_sessions: 10 } } as any;

      toolRegistry.register(new MockTool('SearchTool', 'SEARCH'));
      toolRegistry.register(new MockTool('SummarizeTool', 'SUMMARIZE'));

      const searchAgent = new WorkerAgent(toolRegistry);
      await searchAgent.initFromJSON({ id: 'a1', role: 'Searcher', capabilities: ['SEARCH'] });
      const sumAgent = new WorkerAgent(toolRegistry);
      await sumAgent.initFromJSON({ id: 'a2', role: 'Summarizer', capabilities: ['SUMMARIZE'] });
      agentRegistry.register(searchAgent);
      agentRegistry.register(sumAgent);

      const session = await sessionManager.createFromJSON({ id: 's1', goal: 'g' }) as BaseSession;
      session.agentRegistry = agentRegistry;
      session.taskGraph.addTask('A', { type: 'SearchTool', goal: 'search' });
      session.taskGraph.addTask('B', { type: 'SummarizeTool', goal: 'summarize' });
      session.taskGraph.addDependency('A', 'B');

      const logSpy = jest.spyOn(console, 'log');
      await runtime.start();

      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Executing task: A'));

      // 確保第一次 tick 的所有後續處理（如成功後的排程）都跑完
      for (let i = 0; i < 5; i++) await Promise.resolve();

      jest.advanceTimersByTime(100);
      // 確保第二次 tick 的執行邏輯跑完
      for (let i = 0; i < 10; i++) await Promise.resolve();
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Executing task: B'));

      await runtime.stop();
      jest.useRealTimers();
      logSpy.mockRestore();
    });
  });

  // ==========================================
  // Real LLM Tests (requires OPENAI_API_KEY and SUPERNOVA_RUN_REAL_LLM)
  // ==========================================
  if (process.env.OPENAI_API_KEY && process.env.SUPERNOVA_RUN_REAL_LLM === 'true') {
    describe('Real LLM E2E Tests', () => {
      let modelRegistry: ModelRegistry;
      let planEngine: TaskPlanEngine;
      let coordinator: CoordinatorAgent;
      let agentRegistry: AgentRegistry;
      let toolRegistry: ToolRegistry;
      let sessionManager: SessionManager;

      beforeEach(async () => {
        const realModel = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
        const inference = new InferenceEngine(realModel as any);
        modelRegistry = new ModelRegistry();
        modelRegistry.registerModel(ModelPreset.SMART, inference);
        modelRegistry.registerModel(ModelPreset.EVAL, inference);

        planEngine = new TaskPlanEngine(modelRegistry);
        coordinator = new CoordinatorAgent(planEngine);
        await coordinator.initFromJSON({ id: "coord", role: "COORDINATOR" });

        toolRegistry = new ToolRegistry();
        agentRegistry = new AgentRegistry(modelRegistry, toolRegistry);
        sessionManager = new SessionManager();
      });

      it('should produce a full task graph for a goal', async () => {
        const graph = await coordinator.planTaskGraph("Build a weather CLI");
        expect(graph.nodes.length).toBeGreaterThan(0);
      }, 60000);

      it('should recover from failure via adaptive replanning', async () => {
        const goal = "Save 'test' to 'forbidden.txt'. If fails, use 'backup.txt'.";
        toolRegistry.register(new MockTool('work', 'work', 'TIER_2'));
        const worker = new WorkerAgent(toolRegistry, modelRegistry);
        await worker.initFromJSON({ id: "w1", role: "worker", capabilities: ["WORK"] });
        agentRegistry.register(worker);
        agentRegistry.register(coordinator);

        const session = await sessionManager.createFromJSON({ id: "s-replan", goal }) as BaseSession;
        session.agentRegistry = agentRegistry;
        const taskGraph = await coordinator.planTaskGraph(goal);
        await session.loadFromJSON({ taskGraph });

        let failureDetected = false;
        for (let i = 0; i < 10; i++) {
          try { await session.tick(); } catch (e) { failureDetected = true; }
          if (session.taskGraph.size === 0) break;
        }
        expect(failureDetected).toBe(true);
        expect(session.taskGraph.size).toBe(0);
      }, 120000);
    });
  }
});
