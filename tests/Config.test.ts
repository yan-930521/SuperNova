import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader } from '../src/config/ConfigLoader';
import { DEFAULT_CONFIG } from '../src/config/DefaultConfig';

describe('Config Theme Tests', () => {
  let loader: ConfigLoader;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    loader = new ConfigLoader();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'supernova-theme-test-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('ConfigLoader', () => {
    it('should correctly merge multi-level objects and preserve defaults', () => {
      const customConfig = {
        runtime: { tick_rate_ms: 200 },
        security: { allow_tier_3_tools: true }
      };

      const result = loader.load(customConfig);

      expect(result.runtime.tick_rate_ms).toBe(200);
      expect(result.security.allow_tier_3_tools).toBe(true);
      expect(result.runtime.max_active_sessions).toBe(DEFAULT_CONFIG.runtime.max_active_sessions);
    });

    it('should return a deep frozen object', () => {
      const result = loader.load();
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.runtime)).toBe(true);
      expect(() => { (result.runtime as any).tick_rate_ms = 999; }).toThrowError(TypeError);
    });

    it('should bootstrap default config when file is missing', async () => {
      const result = await loader.bootstrap(configPath);
      expect(result).toEqual(DEFAULT_CONFIG);
      const savedContent = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(savedContent).toEqual(DEFAULT_CONFIG);
    });

    it('should load and merge existing config file', async () => {
      const customFileContent = {
        observability: { mode: 'PRODUCTION', oplog_compression_threshold: 50 }
      };
      await fs.writeFile(configPath, JSON.stringify(customFileContent));

      const result = await loader.bootstrap(configPath);
      expect(result.observability.mode).toBe('PRODUCTION');
      expect(result.observability.oplog_compression_threshold).toBe(50);
      expect(result.observability.enable_tracing).toBe(DEFAULT_CONFIG.observability.enable_tracing);
    });
  });
});
