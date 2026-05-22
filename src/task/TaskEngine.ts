import { TaskGraph } from '../session/TaskGraph';
import { TaskStore } from './TaskStore';
import { TaskEngineEvents } from './TaskEngineEvents';

export class TaskEngine {
  private graph: TaskGraph = new TaskGraph();
  private store: TaskStore;
  private events: TaskEngineEvents;
  private isRunning: boolean = false;

  constructor(public sessionId: string) {
    this.store = new TaskStore();
    this.events = new TaskEngineEvents(sessionId);
  }

  /**
   * 載入任務圖數據並準備執行
   */
  loadGraph(nodes: any[]) {
    this.graph.loadFromJSON({ nodes });
    nodes.forEach(n => this.store.updateStatus(n.id, 'pending'));
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.events.emit('SESSION_START', { goal: 'Starting execution' });
    
    while (this.isRunning && this.graph.getReadyTasks().length > 0) {
      const readyTasks = this.graph.getReadyTasks();
      // 使用 Promise.all 實現並行執行
      const promises = readyTasks.map(taskId => this.executeTask(taskId));
      await Promise.all(promises);
    }

    this.isRunning = false;
    this.events.emit('SESSION_COMPLETE', {});
  }

  private async executeTask(taskId: string) {
    const node = this.graph.getTask(taskId);
    if (!node) return;

    this.store.updateStatus(taskId, 'running');
    this.events.emit('TASK_START', { taskId, goal: node.goal });

    // --- 這裡未來會接真正的 Worker 派發 ---
    // 暫時模擬成功執行，延遲 10ms
    await new Promise(r => setTimeout(r, 10)); 
    
    this.store.updateStatus(taskId, 'completed');
    this.graph.completeTask(taskId);
    this.events.emit('TASK_COMPLETE', { taskId });
  }

  // 輔助測試
  getTaskState(taskId: string) { return this.store.getTask(taskId); }

  getIsRunning() { return this.isRunning; }
}
