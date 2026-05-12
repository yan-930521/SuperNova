import { AgentComponentFactory } from '../src/agent/AgentComponentFactory';
import { IModelRegistry, ModelPreset } from '../interfaces/runtime/IModelRegistry';

describe('AgentComponentFactory', () => {
  const mockModelRegistry: IModelRegistry = {
    getModel: jest.fn().mockReturnValue({}),
    registerModel: jest.fn(),
  };

  it('should create a TaskPlanEngine for LANGGRAPH_PLANNER', () => {
    const component = AgentComponentFactory.createComponent('LANGGRAPH_PLANNER', mockModelRegistry);
    expect(component).toBeDefined();
    expect(component.constructor.name).toBe('TaskPlanEngine');
  });

  it('should create a ThoughtEngine for THOUGHT_TREE', () => {
    const component = AgentComponentFactory.createComponent('THOUGHT_TREE', mockModelRegistry);
    expect(component).toBeDefined();
    expect(component.constructor.name).toBe('ThoughtEngine');
  });

  it('should throw error for unknown component type', () => {
    expect(() => {
      AgentComponentFactory.createComponent('UNKNOWN', mockModelRegistry);
    }).toThrow('Unknown component type: UNKNOWN');
  });
});
