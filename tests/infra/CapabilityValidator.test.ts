import { CapabilityValidator } from '../../src/infra/CapabilityValidator';
import { IAgent } from '../../interfaces/agent/IAgent';
import { ITool } from '../../interfaces/tool/ITool';

describe('CapabilityValidator', () => {
  // 建立 Mock 工具
  const createMockTool = (reqCaps: string[]): ITool => ({
    name: 'test-tool',
    description: 'test-desc',
    safety_tier: 'TIER_1',
    required_capabilities: reqCaps,
    validateInput: async () => true,
    run: async () => ({})
  } as any);

  // 建立 Mock Agent
  const createMockAgent = (id: string, caps: string[]): IAgent => ({
    id,
    toJSON: () => ({ capabilities: caps })
  } as any);

  test('should allow access to tools with no required capabilities', () => {
    const tool = createMockTool([]);
    const agent = createMockAgent('a1', []);
    expect(CapabilityValidator.validate(agent, tool)).toBe(true);
  });

  test('should pass if agent has all required capabilities', () => {
    const tool = createMockTool(['FILE_READ', 'NETWORK_SEND']);
    const agent = createMockAgent('a1', ['FILE_READ', 'NETWORK_SEND', 'OTHER']);
    expect(CapabilityValidator.validate(agent, tool)).toBe(true);
  });

  test('should fail if agent misses any required capability', () => {
    const tool = createMockTool(['ADMIN', 'WRITE']);
    const agent = createMockAgent('a1', ['WRITE']);
    expect(CapabilityValidator.validate(agent, tool)).toBe(false);
  });

  test('should handle agents with no capabilities defined', () => {
    const tool = createMockTool(['READ']);
    const agent = createMockAgent('a1', undefined as any);
    expect(CapabilityValidator.validate(agent, tool)).toBe(false);
  });
});
