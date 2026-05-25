import { AIMessage } from '@langchain/core/messages';
import { TaskManager } from '../../src/manager/TaskManager';
import { AgentManager } from '../../src/manager/AgentManager';
import { SessionManager } from '../../src/manager/SessionManager';
import { ChainStatus, TaskStatus, SystemEvent } from '../../src/task/types';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { EventBus } from '../../src/infra/EventBus';
import { ModelRegistry, ModelPreset } from '../../src/infra/ModelRegistry';

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
    runtime.sessionManager = new SessionManager({ save: jest.fn(), findById: jest.fn() } as any);
    runtime.taskManager = new TaskManager(runtime.agentManager, { save: jest.fn() } as any);
  });

  it('應能完整跑完 提交 -> 規劃 -> 執行的自動化流程', async () => {
    const { chainId } = await runtime.taskManager.submit('Integrated Test Goal', 'session-123', 'user-1');

    // 1. 驗證進入規劃狀態
    let status = runtime.taskManager.getChainStatus(chainId);
    expect(status?.status).toBe(ChainStatus.PLANNING);

    // 2. 等待規劃與執行完成
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      status = runtime.taskManager.getChainStatus(chainId);
      if (status?.status === ChainStatus.COMPLETED) break;
    }

    expect(status?.status).toBe(ChainStatus.COMPLETED);
  });
});
