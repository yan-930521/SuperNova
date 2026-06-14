import { TaskGraph } from '../src/domain/task/TaskGraph';
import { Task } from '../src/domain/task/Task';

async function testTaskGraph() {
  console.log('🔍 Starting TaskGraph optimization verification...');

  const graph = new TaskGraph();
  const taskA = new Task('task-A', 'trace-1', 'session-1', 'Goal A', 'Desc A');
  const taskB = new Task('task-B', 'trace-1', 'session-1', 'Goal B', 'Desc B');
  const taskC = new Task('task-C', 'trace-1', 'session-1', 'Goal C', 'Desc C');

  graph.addTask(taskA);
  graph.addTask(taskB);
  graph.addTask(taskC);

  console.log('✅ Nodes added.');

  // 1. Test normal dependency
  graph.addDependency('task-A', 'task-B');
  graph.addDependency('task-B', 'task-C');
  console.log('✅ Normal dependencies (A -> B -> C) added.');

  // 2. Test Ready tasks
  let ready = graph.getReadyTasks();
  if (ready.length === 1 && ready[0].id === 'task-A') {
    console.log('✅ Initial ready task is A.');
  } else {
    throw new Error('Initial ready task check failed');
  }

  // 3. Test phase filtering (A is StandardFlow by default, currentPhase is READY)
  let readyPhase = graph.getReadyTasks('READY');
  if (readyPhase.length === 1 && readyPhase[0].id === 'task-A') {
    console.log('✅ Phase filtering (READY) successful.');
  }
  
  let readyDoing = graph.getReadyTasks('DOING');
  if (readyDoing.length === 0) {
    console.log('✅ Phase filtering (DOING) successful (no tasks).');
  }

  // 4. Test circular dependency detection
  console.log('🔄 Testing circular dependency (C -> A)...');
  try {
    graph.addDependency('task-C', 'task-A');
    throw new Error('Circular dependency should have been detected!');
  } catch (e: any) {
    if (e.message.includes('Circular dependency detected')) {
      console.log('✅ Circular dependency detected and blocked correctly.');
    } else {
      throw e;
    }
  }

  // 5. Test task completion unlocking
  console.log('🔓 Testing task completion unlocking...');
  graph.handleTaskCompletion('task-A');
  ready = graph.getReadyTasks();
  if (ready.length === 1 && ready[0].id === 'task-B') {
    console.log('✅ Task B unlocked after A completed.');
  } else {
    throw new Error('Task B unlocking failed');
  }

  console.log('🎉 All TaskGraph verifications passed!');
}

testTaskGraph().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
