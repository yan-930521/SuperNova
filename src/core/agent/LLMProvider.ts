import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { Config } from '../config/Config';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { LogManager } from '../infra/LogManager';

/**
 * 集中管理與快取 LangChain LLM 實例的提供者
 */
export class LLMProvider implements ILifecycle {
    private llmInstances = new Map<string, BaseChatModel>();
    private config: Config;

    constructor(config: Config) {
        this.config = config;
    }

    public async initialize(): Promise<void> {
        LogManager.recorder.info('[LLMProvider] Initializing LLM Provider...');
        // 可以在這裡預先載入 default preset
        this.getModel(this.config.llm.default_preset);
    }

    public async stop(): Promise<void> {
        LogManager.recorder.info('[LLMProvider] Shutting down LLM Provider, clearing instances...');
        this.llmInstances.clear();
    }

    /**
     * 獲取對應 preset 的 LangChain Chat Model 實例 (自動實例化並快取)
     */
    public getModel(presetName?: string): BaseChatModel {
        const finalPresetName = presetName ?? this.config.llm.default_preset;

        if (!this.llmInstances.has(finalPresetName)) {
            // 根據 preset 讀取對應的配置，若找不到則回退到空配置
            const presetConfig = this.config.llm.presets[finalPresetName] || {};

            this.llmInstances.set(finalPresetName, new ChatOpenAI({
                ...presetConfig
            }));
        }
        return this.llmInstances.get(finalPresetName)!;
    }
}
