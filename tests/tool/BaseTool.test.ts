import { BaseTool } from '../../src/tool/BaseTool';

/**
 * 用於測試的 Mock 工具
 */
class MockTool extends BaseTool<{ value: number }, { result: number }> {
  constructor() {
    super(
      'MockTool',
      'A tool for testing BaseTool',
      'TIER_1',
      ['test-cap']
    );
  }

  /**
   * 簡單的執行邏輯：將輸入值乘以 2
   */
  async run(input: { value: number }): Promise<{ result: number }> {
    return { result: input.value * 2 };
  }
}

describe('BaseTool', () => {
  it('should initialize with correct properties', () => {
    const tool = new MockTool();
    expect(tool.name).toBe('MockTool');
    expect(tool.description).toBe('A tool for testing BaseTool');
    expect(tool.safety_tier).toBe('TIER_1');
    expect(tool.required_capabilities).toContain('test-cap');
  });

  it('should default validateInput to true', async () => {
    const tool = new MockTool();
    const isValid = await tool.validateInput({ value: 10 });
    expect(isValid).toBe(true);
  });

  it('should allow overriding validateInput', async () => {
    /**
     * 重寫驗證邏輯的工具
     */
    class CustomValidateTool extends MockTool {
      async validateInput(input: { value: number }): Promise<boolean> {
        return input.value > 0;
      }
    }
    
    const tool = new CustomValidateTool();
    
    // 正確的輸入
    const isValid = await tool.validateInput({ value: 10 });
    expect(isValid).toBe(true);
    
    // 錯誤的輸入
    const isInvalid = await tool.validateInput({ value: -1 });
    expect(isInvalid).toBe(false);
  });

  it('should execute run logic correctly', async () => {
    const tool = new MockTool();
    const output = await tool.run({ value: 5 });
    expect(output.result).toBe(10);
  });
});
