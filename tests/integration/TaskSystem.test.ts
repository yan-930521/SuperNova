import { AIMessage } from '@langchain/core/messages';
import { TaskManager } from '../../src/task/TaskManager';
import { ChainStatus, TaskStatus, SystemEvent } from '../../src/task/types';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { SessionManager } from '../../src/infra/SessionManager';
import { AgentRegistry } from '../../src/infra/AgentRegistry';
import { EventBus } from '../../src/infra/EventBus';
import { ModelRegistry, InferenceEngine, ModelPreset } from '../../src/infra/ModelRegistry';

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
    let callCount = 0;
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
        // 4. TaskExpandResponseSchema (用於展開或重新規劃)
        // 為了避免 LangGraph 遞迴無限循環，我們需要確保展開邏輯能終止
        // 在目前的 TaskPlanner 中，expand 是最後一站，所以回傳一次即可
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
      new SessionManager(),
      new AgentRegistry(),
      eventBus,
      mockModelRegistry
    );
  });

  it('應能完整跑完 提交 -> 規劃 -> 執行的自動化流程', async () => {
    const { chainId } = await runtime.taskManager.submit('Integrated Test Goal', 'session-123', 'user-1');

    // 1. 驗證進入規劃狀態
    let status = runtime.taskManager.getChainStatus(chainId);
    expect(status?.status).toBe(ChainStatus.PLANNING);

    // 2. 等待規劃與執行完成
    // 增加等待時間以確保非同步隊列跑完
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      status = runtime.taskManager.getChainStatus(chainId);
      if (status?.status === ChainStatus.COMPLETED) break;
    }

    expect(status?.status).toBe(ChainStatus.COMPLETED);

    // 3. 驗證是否發布了必要的事件
    const history = (runtime.sessionManager as any).sessions.get('session-123')?.history;
    // 預期至少有 User 訊息、SESSION_START 對應的訊息 (如果有) 以及 Worker 的摘要
    // 這裡我們檢查是否有 worker 的摘要併入 (additional_kwargs.is_worker_summary)
    const workerMsgs = history?.filter((m: any) => m instanceof AIMessage && m.additional_kwargs?.is_worker_summary);
    expect(workerMsgs.length).toBeGreaterThan(0);
  });
});
