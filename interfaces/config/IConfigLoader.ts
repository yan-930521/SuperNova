import type { IConfig, DeepPartial } from './IConfig';

/**
 * 配置加載器介面
 * 負責系統啟動時的配置初始化、讀取與合併邏輯。
 */
export interface IConfigLoader {
  /**
   * 系統引導引導 (Bootstrap)
   * 執行「偵測 -> 自動生成 (若缺失) -> 加載 -> 校驗 -> 凍結」的生命週期。
   * @param targetPath 配置檔案的存儲路徑 (例如: './supernova.json')
   * @returns 返回最終生成的完整且不可變的配置物件
   */
  bootstrap(targetPath: string): Promise<IConfig>;

  /**
   * 手動加載與合併
   * 將傳入的自定義配置與系統預設配置進行深層合併。
   * @param custom 局部配置物件，其結構必須符合 IConfig 的子集
   * @returns 返回合併後的完整配置物件
   */
  load(custom?: DeepPartial<IConfig>): IConfig;
}
