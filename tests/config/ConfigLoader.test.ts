import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader } from '../../src/config/ConfigLoader';
import { DEFAULT_CONFIG } from '../../src/config/DefaultConfig';

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    loader = new ConfigLoader();
    // 創建臨時測試目錄
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'supernova-test-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(async () => {
    // 測試結束後清理臨時目錄
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('應該能正確合併多層級對象，且未覆蓋部分保留預設值', () => {
      const customConfig = {
        runtime: {
          tick_rate_ms: 200 // 覆寫預設的 100
        },
        security: {
          allow_tier_3_tools: true // 覆寫預設的 false
        }
      };

      const result = loader.load(customConfig);

      // 驗證已覆寫的部分
      expect(result.runtime.tick_rate_ms).toBe(200);
      expect(result.security.allow_tier_3_tools).toBe(true);

      // 驗證保留的預設值
      expect(result.runtime.max_active_sessions).toBe(DEFAULT_CONFIG.runtime.max_active_sessions);
      expect(result.observability.mode).toBe(DEFAULT_CONFIG.observability.mode);
      expect(result.observability.enable_tracing).toBe(DEFAULT_CONFIG.observability.enable_tracing);
    });

    it('驗證回傳的對象及其內部結構均為不可變 (深度凍結)', () => {
      const result = loader.load();

      // 驗證最外層
      expect(Object.isFrozen(result)).toBe(true);
      // 驗證內層屬性
      expect(Object.isFrozen(result.runtime)).toBe(true);
      expect(Object.isFrozen(result.observability)).toBe(true);
      expect(Object.isFrozen(result.security)).toBe(true);

      // 在嚴格模式下，嘗試修改已凍結物件的屬性會拋出 TypeError
      expect(() => {
        (result.runtime as any).tick_rate_ms = 999;
      }).toThrowError(TypeError);

      // 值不應被修改
      expect(result.runtime.tick_rate_ms).toBe(DEFAULT_CONFIG.runtime.tick_rate_ms);
    });
  });

  describe('bootstrap()', () => {
    it('當配置檔案缺失時，應自動生成預設檔案並回傳預設配置', async () => {
      // 驗證初始狀態檔案不存在
      await expect(fs.access(configPath)).rejects.toThrow();

      const result = await loader.bootstrap(configPath);

      // 驗證回傳的配置與 DEFAULT_CONFIG 一致
      expect(result).toEqual(DEFAULT_CONFIG);

      // 驗證預設配置檔案已成功寫入硬碟
      const savedContent = await fs.readFile(configPath, 'utf-8');
      const savedConfig = JSON.parse(savedContent);
      expect(savedConfig).toEqual(DEFAULT_CONFIG);
    });

    it('當配置檔案存在時，應正確讀取並與預設配置進行合併', async () => {
      const customFileContent = {
        observability: {
          mode: 'PRODUCTION', // 覆寫預設值
          oplog_compression_threshold: 50 // 覆寫預設值
        }
      };
      
      // 先寫入自定義配置檔案
      await fs.writeFile(configPath, JSON.stringify(customFileContent));

      const result = await loader.bootstrap(configPath);

      // 驗證來自檔案的配置已生效
      expect(result.observability.mode).toBe('PRODUCTION');
      expect(result.observability.oplog_compression_threshold).toBe(50);

      // 驗證檔案中未定義的部分保留預設值
      expect(result.observability.enable_tracing).toBe(DEFAULT_CONFIG.observability.enable_tracing);
      expect(result.runtime.tick_rate_ms).toBe(DEFAULT_CONFIG.runtime.tick_rate_ms);
    });
  });
});
