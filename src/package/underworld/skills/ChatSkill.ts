import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export interface ChatArgs {
    /** 發言模式：'public' 為公頻發言，'pm' 為私訊 */
    mode?: 'public' | 'pm';
    /** 訊息內容 */
    message: string;
    /** 私訊對象，當 mode 為 'pm' 時必填 */
    player?: string;
}

export default class ChatSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'chat';
    public readonly description = '在 Minecraft 中發言。可以選擇在公開頻道 (public) 發言，或者私訊 (pm) 指定的玩家。';

    public async execute(args: ChatArgs): Promise<string> {
        if (!args || !args.message) {
            throw new Error('請提供要發送的訊息 (message)。');
        }

        const mode = args.mode || 'public';

        if (mode === 'pm') {
            if (!args.player) {
                throw new Error('私訊模式 (pm) 必須提供目標玩家名稱 (player)。');
            }
            this.env.whisper(args.player, args.message);
            this.state.update('lastChat', { mode: 'pm', player: args.player, message: args.message });
            return `[Chat] 已私訊 ${args.player}: ${args.message}`;
        }

        this.env.chat(args.message);
        this.state.update('lastChat', { mode: 'public', message: args.message });
        return `[Chat] 已於公頻發言: ${args.message}`;
    }
}
