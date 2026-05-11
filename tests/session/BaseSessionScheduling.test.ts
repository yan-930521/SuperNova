import { BaseSession } from '../../src/session/BaseSession';

describe('BaseSession Scheduling Integration', () => {
  let session: BaseSession;

  beforeEach(() => {
    session = new BaseSession('test-session', 'Parallel Scheduling Test');
  });

  it('should execute a single task in one tick', async () => {
    session.taskGraph.addTask('task1');
    
    const spy = jest.spyOn(console, 'log');
    await session.tick();
    
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: task1');
    expect(session.taskGraph.getReadyTasks()).toEqual([]);
    spy.mockRestore();
  });

  it('should execute multiple independent tasks in one tick', async () => {
    session.taskGraph.addTask('task1');
    session.taskGraph.addTask('task2');
    
    const spy = jest.spyOn(console, 'log');
    await session.tick();
    
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: task1');
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: task2');
    expect(session.taskGraph.getReadyTasks()).toEqual([]);
    spy.mockRestore();
  });

  it('should execute tasks with dependencies across multiple ticks', async () => {
    // task1 -> task2 -> task3
    session.taskGraph.addTask('task1');
    session.taskGraph.addTask('task2');
    session.taskGraph.addTask('task3');
    session.taskGraph.addDependency('task1', 'task2');
    session.taskGraph.addDependency('task2', 'task3');

    const spy = jest.spyOn(console, 'log');

    // First tick: only task1 is ready
    await session.tick();
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: task1');
    expect(spy).not.toHaveBeenCalledWith('[BaseSession] Executing task: task2');

    // Second tick: task2 is unlocked
    await session.tick();
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: task2');
    expect(spy).not.toHaveBeenCalledWith('[BaseSession] Executing task: task3');

    // Third tick: task3 is unlocked
    await session.tick();
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: task3');

    spy.mockRestore();
  });

  it('should maximize parallelism for independent branches', async () => {
    /**
     *   t1 -> t2
     *   t3 -> t4
     */
    session.taskGraph.addTask('t1');
    session.taskGraph.addTask('t2');
    session.taskGraph.addTask('t3');
    session.taskGraph.addTask('t4');
    session.taskGraph.addDependency('t1', 't2');
    session.taskGraph.addDependency('t3', 't4');

    const spy = jest.spyOn(console, 'log');

    // First tick: t1 and t3 should run
    await session.tick();
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: t1');
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: t3');
    expect(spy).not.toHaveBeenCalledWith('[BaseSession] Executing task: t2');
    expect(spy).not.toHaveBeenCalledWith('[BaseSession] Executing task: t4');

    // Second tick: t2 and t4 should run
    await session.tick();
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: t2');
    expect(spy).toHaveBeenCalledWith('[BaseSession] Executing task: t4');

    spy.mockRestore();
  });
});
