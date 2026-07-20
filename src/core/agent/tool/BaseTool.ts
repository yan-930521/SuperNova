import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 工具執行上下文
 * 確保工具在被呼叫時，能夠獲取發起調用的 Agent 所屬的會話與工作空間環境
 */
export interface ToolContext {
  /** 觸發工具的對話會話 ID */
  sessionId: string;
  /** 觸發工具的 Agent ID */
  agentId: string;
  /** 該 Agent 的專屬沙盒/物理路徑 (如果是操作檔案等需求) */
  workspacePath: string;
}

/**
 * 系統核心工具抽象基底 (BaseTool)
 * - 強制使用 Zod 進行參數的強型別驗證
 * - 執行期提供 ToolContext 確保沙盒隔離與安全性
 * - 與 LangChain 解耦，但提供轉譯器
 */
export abstract class BaseTool<T extends z.ZodTypeAny = any> {
  /**
   * 工具名稱 (供 LLM 識別，建議使用英文、數字、底線，且具備唯一性)
   */
  public abstract readonly name: string;

  /**
   * 工具描述 (供 LLM 閱讀，必須清楚描述何時該呼叫這個工具、以及參數的意義)
   */
  public abstract readonly description: string;

  /**
   * Zod 定義的參數 Schema，用於執行期的強型別驗證
   */
  public abstract readonly schema: T;

  /**
   * 具體執行工具的邏輯
   * @param args 經過 Zod 解析與驗證後的參數
   * @param context 執行上下文 (包含 Session 與 Workspace 等資訊)
   * @returns 回傳給 LLM 觀看的執行結果 (建議為字串或 JSON 字串)
   */
  public abstract execute(args: z.infer<T>, context: ToolContext): Promise<string>;

  /**
   * 將此自定義 BaseTool 動態轉譯為 LangChain 相容的 DynamicStructuredTool
   * 以便注入給 @langchain/openai 的 bindTools 中使用
   * @param context 執行時欲綁定的上下文
   */
  public toLangChainTool(context: ToolContext): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.name,
      description: this.description,
      schema: this.schema,
      func: async (parsedArgs) => {
        try {
          return await this.execute(parsedArgs, context);
        } catch (error: any) {
          return `Tool execution failed: ${error.message}`;
        }
      }
    });
  }
}
