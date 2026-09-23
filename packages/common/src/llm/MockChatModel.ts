import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatResult } from '@langchain/core/outputs';
import { RunnableBinding } from '@langchain/core/runnables';

/**
 * Mock 聊天模型配置
 */
export interface MockChatModelParams extends BaseChatModelParams {
    /** 預設回傳的純文字內容 */
    defaultResponse?: string;
}

/**
 * 用於單元測試與離線驗證的 Mock Chat Model
 * 支援預設佇列回應 (Queue)、Tool Calling 模擬與呼叫歷史稽核
 */
export class MockChatModel extends BaseChatModel {
    private responseQueue: AIMessage[] = [];
    private callHistory: BaseMessage[][] = [];
    private defaultResponse: string;
    public boundTools: any[] = [];

    constructor(fields?: MockChatModelParams) {
        super(fields ?? {});
        this.defaultResponse = fields?.defaultResponse ?? 'Mock response';
    }

    public _llmType(): string {
        return 'mock_chat_model';
    }

    /**
     * 核心生成方法 (實作 BaseChatModel 要求)
     * 記錄輸入訊息並依據佇列回傳預設回應
     */
    public async _generate(
        messages: BaseMessage[],
        options?: this['ParsedCallOptions']
    ): Promise<ChatResult> {
        // 記錄每次調用的完整 messages 歷史，供測試斷言比對
        this.callHistory.push([...messages]);

        // 若佇列中有預設回應則優先取出，否則使用 defaultResponse
        const responseMessage = this.responseQueue.length > 0
            ? this.responseQueue.shift()!
            : new AIMessage({ content: this.defaultResponse });

        return {
            generations: [
                {
                    message: responseMessage,
                    text: typeof responseMessage.content === 'string' ? responseMessage.content : '',
                },
            ],
        };
    }

    /**
     * 綁定工具 (與 LangChain bindTools 相容)
     * @param tools 欲綁定的工具清單
     */
    public bindTools(tools: any[]): RunnableBinding<BaseMessage[], any, any> {
        this.boundTools = tools;
        return new RunnableBinding({
            bound: this,
            kwargs: {},
            config: {}
        });
    }

    /**
     * 加入一筆預設回應到佇列末端
     */
    public queueResponse(
        response: string | AIMessage | { content: string; tool_calls?: any[] }
    ): this {
        if (typeof response === 'string') {
            this.responseQueue.push(new AIMessage({ content: response }));
        } else if (response instanceof AIMessage) {
            this.responseQueue.push(response);
        } else {
            this.responseQueue.push(
                new AIMessage({
                    content: response.content || '',
                    tool_calls: response.tool_calls || [],
                })
            );
        }
        return this;
    }

    /**
     * 便捷方法：加入一筆包含 Tool Call 的回應
     */
    public queueToolCall(
        name: string,
        args: Record<string, any>,
        id: string = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        content: string = ''
    ): this {
        return this.queueResponse({
            content,
            tool_calls: [
                {
                    id,
                    name,
                    args,
                },
            ],
        });
    }

    /**
     * 取得所有歷史呼叫記錄
     */
    public getCallHistory(): BaseMessage[][] {
        return this.callHistory;
    }

    /**
     * 取得最近一次呼叫的輸入訊息
     */
    public getLastCall(): BaseMessage[] | undefined {
        return this.callHistory[this.callHistory.length - 1];
    }

    /**
     * 清除佇列與歷史記錄
     */
    public reset(): void {
        this.responseQueue = [];
        this.callHistory = [];
        this.boundTools = [];
    }
}
