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

  getIsRunning() { return this.isRunning; }
}
