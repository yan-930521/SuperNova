import { AIMessage } from '@langchain/core/messages';

import { EventBus } from '../../src/infra/EventBus';
import { ModelPreset, ModelRegistry } from '../../src/infra/ModelRegistry';
import { SystemEventType } from '../../src/infra/types/events';
import { ChainStatus, TaskStatus } from '../../src/infra/types/task';
import { AgentManager } from '../../src/manager/AgentManager';
import { SessionManager } from '../../src/manager/SessionManager';
import { TaskManager } from '../../src/manager/TaskManager';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';

/**
 * 任務系統整合測試
 * 模擬從提交目標到最終執行的完整路徑。
 */
describe('Task System Integration', () => {
  let runtime: GlobalRuntime;
  let eventBus: EventBus;
  let mockModelRegistry: ModelRegistry;

  beforeEach(() => {
    eventBus = new EventBus();
    mockModelRegistry = new ModelRegistry();
    
    // 建立一個 Mock InferenceEngine，讓規劃過程不依賴真實 LLM
    const mockEngine = {
      infer: jest.fn().mockImplementation(async (state, schema) => {
        const desc = schema.description || '';
        
        // 1. MilestonePlanSchema
        if (desc.includes('里程碑')) {
          return { milestones: ['M1'] };
        }
        // 2. PlanReviewSchema
        if (desc.includes('合理性')) {
          return { score: 9, rationale: 'Great' };
        }
        // 3. ContextProjectionSchema
        if (desc.includes('投影')) {
          return { expectedSnapshot: 'Snapshot', keyDeliverables: [], newConstraints: [] };
        }
        // 4. TaskExpandResponseSchema
        return {
          nodes: [
            { id: 't1', type: 'work', goal: 'Task 1', dependencies: [], assignedRole: 'Worker' }
          ]
        };
      }),
      withSystemPrompt: jest.fn().mockReturnThis()
    } as any;

    mockModelRegistry.registerModel(ModelPreset.SMART, mockEngine);
    mockModelRegistry.registerModel(ModelPreset.EVAL, mockEngine);

    runtime = new GlobalRuntime(
      eventBus,
      mockModelRegistry
    );

    // 手動注入 (新架構)
    runtime.agentManager = new AgentManager({ findAll: jest.fn().mockResolvedValue([]) } as any);
    
    // 註冊一個 Mock Agent 以供執行
    const mockAgent = {
      id: 'default-worker',
      role: 'Worker',
      execute: jest.fn().mockResolvedValue({ status: 'success', result: 'Done', summary: 'Mock execution successful' })
    } as any;
    runtime.agentManager.register(mockAgent);

    runtime.sessionManager = new SessionManager({ save: jest.fn(), findById: jest.fn() } as any);
    runtime.taskManager = new TaskManager(runtime.agentManager, { save: jest.fn() } as any);
  });

  it('應能完整跑完 提交 -> 規劃 -> 執行的自動化流程', async () => {
    const { chainId } = await runtime.taskManager.submit('Integrated Test Goal', 'session-123', 'user-1');

    // 1. 驗證進入規劃狀態
    let status = runtime.taskManager.getChainStatus(chainId);
    expect(status?.status).toBe(ChainStatus.PLANNING);

    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      status = runtime.taskManager.getChainStatus(chainId);
      if (status?.status === ChainStatus.COMPLETED || status?.status === ChainStatus.FAILED) break;
    }

    if (status?.status === ChainStatus.FAILED) {
      console.log('Chain failed. Tasks:', JSON.stringify(status.nodes, null, 2));
    }

    expect(status?.status).toBe(ChainStatus.COMPLETED);
  });
});
