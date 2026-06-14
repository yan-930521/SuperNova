import { Task } from '../src/domain/task/Task';
import { ContextAssembler } from '../src/application/context/ContextAssembler';

async function testContextAssembly() {
  console.log('🔍 Starting Context Assembly verification...');

  // 1. Setup dependency tasks
  const dep1 = new Task('dep-1', 'trace-1', 'session-1', 'Goal Dep 1', 'Desc Dep 1');
  dep1.output = 'Summary of Dep 1 results.';
  
  const dep2 = new Task('dep-2', 'trace-1', 'session-1', 'Goal Dep 2', 'Desc Dep 2');
  dep2.output = 'Summary of Dep 2 results.';

  // 2. Setup target task
  const target = new Task('target', 'trace-1', 'session-1', 'Main Goal', 'Main Desc');
  target.context = 'Static system info.';
  target.successCriteria = '- Criterion 1\n- Criterion 2';
  target.dependencies = ['dep-1', 'dep-2'];

  // 3. Assemble
  const assembled = ContextAssembler.assemble(target, [dep1, dep2]);
  
  console.log('--- ASSEMBLED CONTEXT ---');
  console.log(assembled);
  console.log('-------------------------');

  // 4. Verify content
  if (!assembled.includes('Goal Dep 1') || !assembled.includes('Summary of Dep 2 results.')) {
    throw new Error('Dependency summary missing in assembled context');
  }
  
  if (!assembled.includes('Main Goal') || !assembled.includes('Criterion 1')) {
    throw new Error('Target task info missing in assembled context');
  }

  console.log('🎉 Context Assembly verification passed!');
}

testContextAssembly().catch(console.error);
