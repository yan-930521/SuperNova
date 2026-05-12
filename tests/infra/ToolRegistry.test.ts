import { ToolRegistry } from '../../src/infra/ToolRegistry';
import type { ITool } from '../../interfaces/tool/ITool';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('should register and retrieve a tool by name', () => {
    const mockTool: ITool = {
      name: 'test-tool',
      description: 'A test tool',
      safety_tier: 'TIER_1',
      validateInput: jest.fn().mockResolvedValue(true),
      run: jest.fn().mockResolvedValue('output'),
      required_capabilities: []
    };

    registry.register(mockTool);
    expect(registry.getTool('test-tool')).toBe(mockTool);
  });

  test('should return undefined for non-existent tool', () => {
    expect(registry.getTool('ghost')).toBeUndefined();
  });

  test('should overwrite tool when registering with same name', () => {
    const tool1 = { name: 'dup', description: 'desc1' } as ITool;
    const tool2 = { name: 'dup', description: 'desc2' } as ITool;

    registry.register(tool1);
    registry.register(tool2);

    expect(registry.getTool('dup')).toBe(tool2);
    expect(registry.getTool('dup')?.description).toBe('desc2');
  });

  test('should list all registered tools', () => {
    const tool1 = { name: 'tool1' } as ITool;
    const tool2 = { name: 'tool2' } as ITool;

    registry.register(tool1);
    registry.register(tool2);

    const tools = registry.listTools();
    expect(tools).toHaveLength(2);
    expect(tools).toContain(tool1);
    expect(tools).toContain(tool2);
  });
});
