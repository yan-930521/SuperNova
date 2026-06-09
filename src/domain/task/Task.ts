import { BaseSession } from '../session/BaseSession';
import { TaskDTO, TaskStatus } from '../../infra/types/task';
import { IAgentExecuteResult } from '../../infra/types/agent';
import { BaseTaskFlow } from './flow/BaseTaskFlow';
import { StandardFlow } from './flow/StandardFlow';
import { SimpleFlow } from './flow/SimpleFlow';
import { EmergencyFlow } from './flow/EmergencyFlow';
import { TaskGraph } from './TaskGraph';

// 導入所有 Flow 類別用於還原
import { InstantFlow } from './flow/InstantFlow';
import { ComplexFlow } from './flow/ComplexFlow';
import { ExploratoryFlow } from './flow/ExploratoryFlow';
import { RecursiveFlow } from './flow/RecursiveFlow';

/**
 * 任務實體 (Task)
 * 繼承自 BaseSession，代表二級總帳（Agent 執行的思考與行為軌跡）。
 * 實現「任務即會話」與「分形架構」。
 */
export class Task extends BaseSession {
  public dependencies: string[] = [];
  public assignedAgentId: string | null = null;
  public requiredCapabilities: string[] = [];
  public retryCount: number = 0;

  /** 任務流轉狀態機 (微觀流程) - 採用獨立類別實作 */
  public flow!: BaseTaskFlow;
  /** 子任務圖 (宏觀拆解) */
  public subGraph?: TaskGraph;

  constructor(
    id: string,
    public readonly traceId: string,
    public readonly sessionId: string, // 父會話 ID
    public readonly goal: string,
    public readonly description: string,
    public readonly type: string = 'work',
    status: TaskStatus = 'pending'
  ) {
    super(id, status);
  }

  /**
   * 更新任務狀態
   */
  public updateStatus(status: TaskStatus): void {
    this.status = status;
  }

  /**
   * 驅動狀態機前進
   * @param result 當前 Phase 的執行結果
   */
  public nextPhase(result: string): string {
    // 呼叫領域類別內置的遷徙邏輯
    return this.flow.nextPhase(result);
  }

  /**
   * 從代理執行結果中吸收歷史軌跡
   */
  public absorbExecuteResult(aeResult: IAgentExecuteResult): void {
    if (aeResult.result && aeResult.result.history) {
      this.history.push(...aeResult.result.history);
    }
    
    if (aeResult.status === 'success') {
      this.updateStatus('completed');
    } else {
      this.updateStatus('failed');
      this.metadata.lastError = aeResult.error;
    }
  }

  /**
   * 設置子圖數據
   * 確保將 DTO 數據正確轉換為 TaskGraph 領域物件
   */
  public setSubGraph(data: any): void {
    if (data instanceof TaskGraph) {
      this.subGraph = data;
    } else {
      this.subGraph = new TaskGraph();
      this.subGraph.loadData(data);
    }
  }

  /**
   * 從 DTO 還原為實體實例 (根據 templateType 初始化對應的 Flow 類別)
   */
  public static fromDTO(dto: TaskDTO): Task {
    const task = new Task(
      dto.id,
      dto.traceId,
      dto.sessionId,
      dto.goal,
      dto.description,
      dto.type,
      dto.status
    );
    task.dependencies = dto.dependencies || [];
    task.assignedAgentId = dto.assignedAgentId || null;
    task.requiredCapabilities = dto.requiredCapabilities || [];
    task.retryCount = dto.retryCount || 0;
    task.metadata = dto.metadata || {};
    
    // 根據 DTO 的 templateType 還原具體的 Flow 類別實例
    if (dto.flow) {
      const type = dto.flow.templateType;
      switch (type) {
        case 'Instant': task.flow = new InstantFlow(); break;
        case 'Simple': task.flow = new SimpleFlow(); break;
        case 'Standard': task.flow = new StandardFlow(); break;
        case 'Complex': task.flow = new ComplexFlow(); break;
        case 'Exploratory': task.flow = new ExploratoryFlow(); break;
        case 'Emergency': task.flow = new EmergencyFlow(); break;
        case 'Recursive': task.flow = new RecursiveFlow(); break;
        default: task.flow = new StandardFlow(); break;
      }
      task.flow.restoreFromDTO(dto.flow);
    }

    // 還原子圖 (分形)
    if (dto.subGraph) {
      task.setSubGraph(dto.subGraph);
    }

    if (dto.history) {
      task.setHistory(dto.history);
    }
    
    return task;
  }

  /**
   * 轉換為 DTO 用於持久化
   */
  public toDTO(): TaskDTO {
    return {
      id: this.id,
      traceId: this.traceId,
      sessionId: this.sessionId,
      goal: this.goal,
      description: this.description,
      type: this.type,
      status: this.status as TaskStatus,
      dependencies: this.dependencies,
      assignedAgentId: this.assignedAgentId,
      requiredCapabilities: this.requiredCapabilities,
      retryCount: this.retryCount,
      history: this.history,
      metadata: this.metadata as Record<string, any>,
      flow: this.flow.toDTO(),
      subGraph: this.subGraph ? this.subGraph.toDTO() : undefined
    };
  }
}
