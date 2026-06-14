import { TaskService } from '../src/application/task/TaskService';
import { Task } from '../src/domain/task/Task';
import { TaskGraph } from '../src/domain/task/TaskGraph';
import { EventBus } from '../src/core/messaging/MessageBus';
import { SystemEvents, AgentEvents } from '../src/core/messaging/IBus';
import { DEFAULT_CONFIG } from '../src/config/DefaultConfig';

async function demoConcurrency() {
  console.log('🔍 Starting Task Concurrency Dispatching Demo...');

  const systemBus = new EventBus();
  const agentBus = new EventBus();
  
  // 模擬 Repo
  const mockRepo: any = { save: async () => {}, findRootsBySession: async () => [] };
  
  const taskService = new TaskService(mockRepo, systemBus, agentBus, DEFAULT_CONFIG);
  
  // 監聽啟動事件
  let startedCount = 0;
  agentBus.subscribe(AgentEvents.Phase.Start, (event) => {
    console.log(`🚀 Task Started: ${event.payload.taskId} (Phase: ${event.payload.phase})`);
    startedCount++;
  });

  // 1. 建立一個包含 5 個並行任務的圖 (DOING 階段)
  const rootTask = new Task('root', 'trace-1', 'session-1', 'Root Goal', 'Root Desc');
  const subGraph = new TaskGraph();
  
  for (let i = 1; i <= 5; i++) {
    const sub = new Task(`sub-${i}`, 'trace-1', 'session-1', `Sub Goal ${i}`, `Sub Desc ${i}`);
    sub.flow.currentPhase = 'DOING';
    subGraph.addTask(sub);
  }
  
  rootTask.setSubGraph(subGraph);
  taskService.registerTask(rootTask);

  console.log('✅ Task Tree with 5 parallel DOING tasks registered.');

  // 2. 觸發調度
  console.log('⏱️ Dispatching Ready Tasks...');
  taskService.dispatchReadyTasks();

  // 延遲一下讓非同步訂閱處理完成
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`📊 Summary: Started ${startedCount} tasks.`);
  
  if (startedCount === 5) {
    console.log('🎉 Concurrency dispatching works!');
  } else {
    console.error(`❌ Expected 5 tasks to start, but got ${startedCount}`);
    process.exit(1);
  }
}

demoConcurrency().catch(console.error);
