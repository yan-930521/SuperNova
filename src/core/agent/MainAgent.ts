import { Config } from '../config/Config';
import { IDataBlockRepository } from '../infra/persistence/IRepository';
import {
    AgentEvent, HookEvent, IEventBus, PromptSectionIndex, SystemEvent
} from '../messaging/IBus';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentOptions, AgentState, AgentType, BaseAgent, BaseAgentData } from './BaseAgent';

/**
 * MainAgent
 * 系統的中樞大腦與全局管理者，負責高階邏輯路由與長期記憶。
 */
export class MainAgent extends BaseAgent {
    public readonly type = AgentType.MAIN;
    public readonly canClone = true;

    constructor(
        id: string,
        sessionId: string,
        eventBus: IEventBus,
        config: Config,
        dataBlockRepo: IDataBlockRepository,
        options?: AgentOptions
    ) {
        super(id, sessionId, eventBus, config, dataBlockRepo, options);

        // 從 JSON 設定檔載入 MainAgent 專屬身份與認知
        if (!this.profile) {
            try {
                const rawContent = PromptLoader.loadProfile('v1/main_agent', this.config, '{}');
                const profileData = JSON.parse(rawContent);
                this.setProfile(profileData);
            } catch (error) {
                this.logger.error(`Failed to load main_agent.json: ${error}`);
            }
        }

        this.initEmotionalState();
    }

    /**
     * 註冊針對 MainAgent 的 Hook 監聽器 (由 BaseAgent 建構子統一調用)
     */
    /**
     * 註冊針對 MainAgent 的 Hook 監聽器 (由 BaseAgent 建構子統一調用)
     */
    protected setupHooks(): void {
        // 1. 動態注入情緒模型到 System Prompt
        this.subscribeEvent(HookEvent.BeforeAgentStep, async (event) => {
            if (event.payload.agentId === this.id && this.emotionalState) {
                const { energy, intimacy, joy, distress, anxiety, fear, pride, stress, excitement, socialNeed } = this.emotionalState;

                let prompt = `## CURRENT INTERNAL STATE & EMOTIONS\n`;
                prompt += `You must adapt your tone and responses based on the following internal states:\n`;
                prompt += `- Energy (Fatigue): ${energy.toFixed(1)}/100 (Below 20 means exhausted)\n`;
                prompt += `- Intimacy (Affinity): ${intimacy.toFixed(1)}/100\n`;
                prompt += `- Current Emotions (0-100):\n`;
                prompt += `  * Joy: ${joy.toFixed(1)}, Excitement: ${excitement.toFixed(1)}, Pride: ${pride.toFixed(1)}\n`;
                prompt += `  * Distress: ${distress.toFixed(1)}, Anxiety: ${anxiety.toFixed(1)}, Fear: ${fear.toFixed(1)}, Stress: ${stress.toFixed(1)}\n`;
                prompt += `  * Social Need (Loneliness): ${socialNeed.toFixed(1)}\n`;

                if (!event.payload.injectedPrompts) event.payload.injectedPrompts = [];
                event.payload.injectedPrompts.push({
                    index: PromptSectionIndex.EMOTIONAL_STATE,
                    content: prompt
                });
            }
        }, { sessionId: this.sessionId });

        // 2. 玩家行為觸發 (Player Interaction Triggers)
        this.subscribeEvent(AgentEvent.AgentMessage, (event) => {
            const block = event.payload;
            if (block.senderId === 'USER' && typeof block.controlPayload === 'string') {
                const text = block.controlPayload.toLowerCase();

                // TODO: 實作真正邏輯
                if (text.includes('讚') || text.includes('謝謝') || text.includes('好') || text.includes('good') || text.includes('thanks')) {
                    this.appraiseEvent({ joy: 20, intimacy: 5, socialNeed: -30 });
                } else if (text.includes('閉嘴') || text.includes('別吵') || text.includes('亂寫') || text.includes('笨')) {
                    this.appraiseEvent({ distress: 30, anxiety: 20, intimacy: -10 });
                } else {
                    // 一般互動降低社交需求
                    this.appraiseEvent({ socialNeed: -20 });
                }
            }
        }, { sessionId: this.sessionId });

        // 3. 工作區環境觸發 (Workstation Triggers)
        this.subscribeEvent(SystemEvent.TaskFinished, (event) => {
            this.appraiseEvent({ joy: 20, pride: 15 });
        }, { sessionId: this.sessionId });

        this.subscribeEvent(SystemEvent.TaskFailed, (event) => {
            this.appraiseEvent({ distress: 20, stress: 15 });
        }, { sessionId: this.sessionId });

        // 4. 接收下級代理 (左右腦) 傳遞上來的神經情緒訊號
        this.subscribeEvent(AgentEvent.EmotionTriggered, (event) => {
            this.appraiseEvent(event.payload.impacts);
        }, { sessionId: this.sessionId });

        // 5. 時間自然觸發 (Passive Decay & Fatigue)
        // TODO: 此處實作 30 秒跑一次遞減假設 Tick 每秒觸發一次 請於config設定
        let tickCounter = 0;
        this.subscribeEvent(SystemEvent.Tick, (event) => {
            tickCounter++;
            if (tickCounter >= 30) {
                tickCounter = 0;
                if (this.emotionalState) {
                    // 自然衰減
                    const decay = (val: number) => Math.max(0, val - 5);
                    this.emotionalState.joy = decay(this.emotionalState.joy);
                    this.emotionalState.distress = decay(this.emotionalState.distress);
                    this.emotionalState.anxiety = decay(this.emotionalState.anxiety);
                    this.emotionalState.fear = decay(this.emotionalState.fear);
                    this.emotionalState.pride = decay(this.emotionalState.pride);
                    this.emotionalState.stress = decay(this.emotionalState.stress);
                    this.emotionalState.excitement = decay(this.emotionalState.excitement);

                    // 社交需求隨時間上升 (冷落超過一段時間)
                    this.emotionalState.socialNeed = Math.min(100, this.emotionalState.socialNeed + 2);

                    // 疲勞消耗
                    this.emotionalState.energy = Math.max(0, this.emotionalState.energy - 1);
                }
            }
        }, { sessionId: this.sessionId });
    }

    /**
     * 初始化情感狀態
     */
    private initEmotionalState(): void {
        if (!this.emotionalState) {
            this.emotionalState = {
                energy: 100,
                intimacy: 20,
                joy: 0,
                distress: 0,
                anxiety: 0,
                fear: 0,
                pride: 0,
                stress: 0,
                excitement: 0,
                socialNeed: 0
            };
        }
    }

    /**
     * 新版極簡情緒轉變演算法
     * 新情緒數值 = 舊數值 + 事件衝擊力 (Impact) * 敏感度權重 (Personality Weight)
     */
    public appraiseEvent(impacts: Partial<Omit<BaseAgentData['emotionalState'], 'attentionMode'>>, personalityWeight: number = 1.0): void {
        if (!this.emotionalState) return;

        const clamp = (val: number) => Math.max(0, Math.min(100, val));
        let shiftTriggered = false;

        for (const [key, impactValue] of Object.entries(impacts)) {
            if (typeof impactValue === 'number' && key in this.emotionalState) {
                const emotionKey = key as keyof typeof this.emotionalState;
                if (typeof this.emotionalState[emotionKey] === 'number') {
                    const oldVal = this.emotionalState[emotionKey] as number;
                    const newVal = clamp(oldVal + (impactValue * personalityWeight));
                    (this.emotionalState as any)[emotionKey] = newVal;

                    // 臨界點閾值檢查 (Threshold Checks)
                    if (newVal > 80 && oldVal <= 80) {
                        shiftTriggered = true;
                        this.logger.info(`[Emotion Engine] Threshold breached: ${key} > 80!`);
                    }
                }
            }
        }
    }
}