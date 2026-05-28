import { describe, expect, it } from 'bun:test';
import { TaskGraph } from '../TaskGraph';

describe('TaskGraph Mutations', () => {
    it('supports removing dependencies', () => {
        const graph = new TaskGraph();
        graph.addTask('t1');
        graph.addTask('t2');
        graph.addDependency('t1', 't2');
        
        expect(graph.getInDegree('t2')).toBe(1);
        
        // Remove dependency
        graph.removeDependency('t1', 't2');
        expect(graph.getInDegree('t2')).toBe(0);
    });

    it('supports updating tasks', () => {
        const graph = new TaskGraph();
        graph.addTask('t1', { goal: 'Old goal' });
        
        // Update task
        graph.updateTask('t1', { goal: 'New goal' });
        const t1 = graph.getTask('t1');
        expect(t1?.goal).toBe('New goal');
    });

    it('supports removing tasks', () => {
        const graph = new TaskGraph();
        graph.addTask('t1');
        graph.addTask('t2');
        graph.addDependency('t1', 't2');
        
        // Remove task
        graph.removeTask('t1');
        
        expect(graph.getTask('t1')).toBeUndefined();
        expect(graph.getInDegree('t2')).toBe(0);
    });
});
