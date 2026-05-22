import { EventBus } from '../infra/EventBus';
import { TaskEngine } from './TaskEngine';

/**
 * 引擎管理器 (EngineManager)
 * 負責全域管理任務引擎實例。
 * 監聽 SESSION_START 事件來啟動引擎，監聽 SESSION_INTERRUPT 事件來中斷引擎。
 */
export class EngineManager {
  private engines = new Map<string, TaskEngine>();

  constructor() {
    this.init();
  }

  /**
   * 初始化事件訂閱
   */
  private init() {
    // 監聽啟動事件
    EventBus.getInstance().subscribe('SESSION_START', (event) => {
      console.log(`[EngineManager] Received SESSION_START for ${event.session_id}`);
      const { session_id, payload } = event;
      
      if (session_id && payload && payload.nodes) {
        console.log(`[EngineManager] Starting engine for ${session_id}`);
        // 避免重複啟動相同 session
        if (this.engines.has(session_id)) return;

        const engine = new TaskEngine(session_id);
        engine.loadGraph(payload.nodes);
        this.engines.set(session_id, engine);
        
        // 啟動引擎
        engine.start().then(() => {
          console.log(`[EngineManager] Engine for ${session_id} completed`);
        }).catch(err => {
          console.error(`[EngineManager] Engine for ${session_id} failed:`, err);
        });
      }
    });

    // 監聽中斷事件
    EventBus.getInstance().subscribe('SESSION_INTERRUPT', (event) => {
      if (event.session_id) {
        const engine = this.engines.get(event.session_id);
        if (engine && engine.getIsRunning()) {
          // 只有當 payload 中包含 reason 且不是引擎自己發出的中斷事件時才調用 interrupt
          // 或者我們簡單地讓引擎處理自己的狀態
          engine.interrupt(event.payload?.reason || 'External interruption');
        }
      }
    });
  }

  /**
   * 獲取指定 Session 的引擎實例
   */
  getEngine(sessionId: string) {
    return this.engines.get(sessionId);
  }
}
