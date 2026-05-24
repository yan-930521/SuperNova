import { TaskGraph } from '../../src/session/TaskGraph';
import { TaskStatus } from '../../src/task/types';

/**
 * TaskGraph Unit Tests
 * Verifies DAG logic, in-degree calculation, and dependency management.
 */
describe('TaskGraph', () => {
  let graph: TaskGraph;

  beforeEach(() => {
    graph = new TaskGraph();
  });

  it('should correctly add task nodes and initialize in-degree to zero', () => {
    graph.addTask('t1', { goal: 'Task 1' });
    expect(graph.size).toBe(1);
    expect(graph.getInDegree('t1')).toBe(0);
    expect(graph.getReadyTasks()).toContain('t1');
  });

  it('should correctly update node in-degree after establishing task dependencies', () => {
    graph.addTask('t1', { goal: 'Task 1' });
    graph.addTask('t2', { goal: 'Task 2' });
    graph.addDependency('t1', 't2');

    expect(graph.getInDegree('t1')).toBe(0);
    expect(graph.getInDegree('t2')).toBe(1);
    expect(graph.getReadyTasks()).toEqual(['t1']);
  });

  it('should correctly unlock and update subsequent task states after marking a task as complete', () => {
    graph.addTask('t1', { goal: 'Task 1' });
    graph.addTask('t2', { goal: 'Task 2' });
    graph.addDependency('t1', 't2');

    graph.completeTask('t1');
    expect(graph.size).toBe(1);
    expect(graph.getInDegree('t2')).toBe(0);
    expect(graph.getReadyTasks()).toEqual(['t2']);
  });

  it('should detect and intercept task relations with circular dependencies', () => {
    graph.addTask('t1');
    graph.addTask('t2');
    graph.addDependency('t1', 't2');
    
    expect(() => {
      graph.addDependency('t2', 't1');
    }).toThrow('Circular dependency detected');
  });

  it('should correctly load full task graph state from a structured data object', () => {
    const data = {
      nodes: [
        { id: 'n1', goal: 'G1', dependencies: [], status: TaskStatus.PENDING, type: 'work' },
        { id: 'n2', goal: 'G2', dependencies: ['n1'], status: TaskStatus.PENDING, type: 'work' }
      ]
    };
    graph.loadFromJSON(data as any);
    expect(graph.size).toBe(2);
    expect(graph.getInDegree('n2')).toBe(1);
    expect(graph.getReadyTasks()).toEqual(['n1']);
  });
});
