import { Guardian, TimeoutError } from '../../src/runtime/Guardian';

describe('Guardian', () => {
  let guardian: Guardian;

  beforeEach(() => {
    guardian = new Guardian();
  });

  test('should complete a successful task within timeout', async () => {
    const task = async () => 'success';
    const result = await guardian.protect(task, 1000);
    expect(result).toBe('success');
  });

  test('should throw TimeoutError if task exceeds timeout', async () => {
    const task = () => new Promise((resolve) => setTimeout(() => resolve('slow'), 500));
    await expect(guardian.protect(task, 100)).rejects.toThrow(TimeoutError);
  });

  test('should pass through task errors', async () => {
    const task = async () => {
      throw new Error('Task Failed');
    };
    await expect(guardian.protect(task, 1000)).rejects.toThrow('Task Failed');
  });

  test('should resolve correct strategies', () => {
    expect(guardian.resolveStrategy(new TimeoutError())).toBe('RETRY');
    expect(guardian.resolveStrategy(new SyntaxError())).toBe('ABORT');
    expect(guardian.resolveStrategy(new Error('Normal Error'))).toBe('IGNORE');
  });
});
