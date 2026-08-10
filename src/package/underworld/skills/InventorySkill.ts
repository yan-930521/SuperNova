import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export default class InventorySkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'inventory_skill';
    public readonly description = '讀取機器人的背包，彙整成易讀的字串回傳，並可丟棄物品。';

    public async execute(args?: { action?: 'view' | 'toss', itemName?: string, count?: number }): Promise<string> {
        if (!args || args.action === 'view' || !args.action) {
            const items = this.env.core.inventory.items();
            if (items.length === 0) {
                // @ts-ignore
                if (this.state && this.state.update) this.state.update('inventory_status', 'Empty');
                return '你的背包目前是空的。';
            }
            const summary = items.map(i => `${i.name} x${i.count}`).join(', ');
            // @ts-ignore
            if (this.state && this.state.update) this.state.update('inventory_status', summary);
            return `你的背包內容：\n${summary}`;
        } else if (args.action === 'toss') {
            if (!args.itemName) return '必須提供 itemName';
            const item = this.env.core.inventory.items().find(i => i.name === args.itemName);
            if (!item) return `背包中沒有找到 ${args.itemName}`;
            
            const count = args.count || item.count;
            try {
                // @ts-ignore
                await this.env.core.toss(item.type, null, count);
                return `成功丟棄了 ${count} 個 ${args.itemName}`;
            } catch (err: any) {
                return `丟棄物品失敗: ${err.message}`;
            }
        }
        return '未知的操作';
    }
}
