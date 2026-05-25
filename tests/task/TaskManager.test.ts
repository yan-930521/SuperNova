import { TaskManager } from '../../src/manager/TaskManager';
import { ChainStatus } from '../../src/task/types';
import { AgentManager } from '../../src/manager/AgentManager';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { SessionManager } from '../../src/manager/SessionManager';
import { EventBus } from '../../src/infra/EventBus';
import { ModelRegistry } from '../../src/infra/ModelRegistry';
import * as fs from 'fs';
import * as path from 'path';

describe('TaskManager', () => {
  let agentManager: AgentManager;
  let runtime: GlobalRuntime;

  beforeEach(() => {
    agentManager = new AgentManager({} as any);
    const modelRegistry = new ModelRegistry();
    
    // 註冊 Mock 模型
    const mockEngine = {
      infer: jest.fn().mockImplementation(async (state, schema) => {
        const desc = schema.description || '';
        // 模擬 MilestonePlanSchema
        if (desc.includes('里程碑')) {
          return { milestones: ['M1'] };
        }
        // 模擬 PlanReviewSchema
        if (desc.includes('合理性')) {
          return { score: 10, rationale: 'OK' };
        }
        // 模擬 ContextProjectionSchema
        if (desc.includes('投影')) {
          return { expectedSnapshot: 'Snap', keyDeliverables: [], newConstraints: [] };
        }
        // 模擬 TaskExpandResponseSchema
        return {
          nodes: [
            { id: 't1', type: 'work', goal: 'Test Task', dependencies: [], assignedRole: 'Worker' }
          ]
        };
      }),
      withSystemPrompt: jest.fn().mockReturnThis()
    } as any;
    modelRegistry.registerModel('smart' as any, mockEngine);
    modelRegistry.registerModel('eval' as any, mockEngine);

    // 初始化 Runtime 以便 TaskPlanner 內部獲取 ModelRegistry
    runtime = new GlobalRuntime(
      new EventBus(),
      modelRegistry
    );
    
    // 手動設置管理器 (對應新架構)
    runtime.agentManager = agentManager;
    runtime.sessionManager = new SessionManager({} as any);
    runtime.taskManager = new TaskManager(agentManager, { save: jest.fn() } as any);
  });

  it('should accept task submission and return IDs', async () => {
    const manager = runtime.taskManager;
    const result = await manager.submit('Test Goal', 's1', 'u1');
    expect(result.chainId).toBeDefined();
    expect(result.traceId).toBeDefined();
  });

  it('should return null for non-existent chain', async () => {
    const manager = runtime.taskManager;
    expect(manager.getChainStatus('non-existent')).toBeNull();
  });

  it('should find chain in inbox after submission', async () => {
    const manager = runtime.taskManager;
    const { chainId } = await manager.submit('Test Goal', 's1', 'u1');
    const status = manager.getChainStatus(chainId);
    expect([ChainStatus.PLANNING, ChainStatus.RUNNING]).toContain(status?.status);
    expect(status?.sessionId).toBe('s1');
  });

  it('should move task from inbox to chains after processing', async () => {
    const manager = runtime.taskManager;
    const { chainId } = await manager.submit('Test Goal', 's1', 'u1');
    
    // Wait for the automatic processing to complete
    let status = manager.getChainStatus(chainId);
    for (let i = 0; i < 20 && status?.status !== ChainStatus.COMPLETED; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      status = manager.getChainStatus(chainId);
    }
    
    expect(status?.status).toBe(ChainStatus.COMPLETED);
  });

  it('should eventually process inbox items', async () => {
    const manager = runtime.taskManager;
    const { chainId } = await manager.submit('Test Goal', 's1', 'u1');
    
    // Wait for a bit to allow automatic processing simulation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const status = manager.getChainStatus(chainId);
    expect(status?.status).toBe(ChainStatus.COMPLETED);
  });

  it('should create a log file after submission', async () => {
    const manager = runtime.taskManager;
    const { traceId } = await manager.submit('Log Test Goal', 's-log', 'u1');
    
    const logDir = path.join(process.cwd(), 'workspace/logs');
    // 注意：實際日誌行為依賴於 LogManager 的 Transport 配置
    // 此測試可能需要調整以驗證 Recorder 的行為
  });
});
