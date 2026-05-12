import { TaskGraph } from '../../src/session/TaskGraph';

describe('TaskGraph', () => {
  let graph: TaskGraph;

  beforeEach(() => {
    graph = new TaskGraph();
  });

  test('should add tasks and store metadata', () => {
    graph.addTask('task1', { data: 'test' });
    expect(graph.getReadyTasks()).toContain('task1');
    expect(graph.getInDegree('task1')).toBe(0);
  });

  test('should overwrite metadata for existing tasks', () => {
    graph.addTask('task1', { data: 'old' });
    graph.addTask('task1', { data: 'new' });
    expect(graph.getInDegree('task1')).toBe(0);
  });

  test('should add dependencies and update in-degree', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addDependency('task1', 'task2');
    expect(graph.getInDegree('task1')).toBe(0);
    expect(graph.getInDegree('task2')).toBe(1);
    expect(graph.getReadyTasks()).toEqual(['task1']);
  });

  test('should throw error for circular dependencies', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addDependency('task1', 'task2');
    expect(() => graph.addDependency('task2', 'task1')).toThrow('Circular dependency detected');
  });

  test('should throw error for non-existent nodes in dependency', () => {
    graph.addTask('task1');
    expect(() => graph.addDependency('task1', 'task2')).toThrow('Task task2 not found');
  });

  test('should update in-degree when task is completed', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addDependency('task1', 'task2');
    graph.completeTask('task1');
    expect(graph.getReadyTasks()).toEqual(['task2']);
    expect(graph.getInDegree('task2')).toBe(0);
  });

  test('should handle multi-level dependencies', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addTask('task3');
    graph.addDependency('task1', 'task2');
    graph.addDependency('task2', 'task3');

    graph.completeTask('task1');
    expect(graph.getReadyTasks()).toEqual(['task2']);

    graph.completeTask('task2');
    expect(graph.getReadyTasks()).toEqual(['task3']);
  });

  test('should serialize and deserialize correctly', () => {
    graph.addTask('task1', { info: 'T1' });
    graph.addTask('task2', { info: 'T2' });
    graph.addTask('task3', { info: 'T3' });
    graph.addDependency('task1', 'task2');
    graph.addDependency('task2', 'task3');
    graph.completeTask('task1');

    const json = graph.toJSON();
    const newGraph = new TaskGraph();
    newGraph.loadFromJSON(json);

    expect(newGraph.getReadyTasks()).toEqual(['task2']);
    expect(newGraph.getInDegree('task3')).toBe(1);
    
    newGraph.completeTask('task2');
    expect(newGraph.getReadyTasks()).toEqual(['task3']);
  });
});
