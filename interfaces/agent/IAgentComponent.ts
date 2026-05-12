import { IAgent } from './IAgent';

/**
 * 代理組件介面，定義代理可插拔組件的基礎結構。
 */
export interface IAgentComponent {
  /** 組件名稱 */
  readonly name: string;
  /**
   * 將組件附加到主體代理。
   * @param host 主體代理實例
   * @param config 組件配置
   */
  attach(host: IAgent, config: Record<string, any>): Promise<void>;
}
