import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export default class CraftSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'craft_skill';
    public readonly description = '透過 recipesFor 查找配方並呼叫 craft 進行合成。若是需要工作台，請確保在附近。';

    public async execute(args?: { itemName: string, count?: number, useCraftingTable?: boolean }): Promise<string> {
        if (!args || !args.itemName) return '必須提供 itemName';
        
        // @ts-ignore
        const itemInfo = this.env.core.registry.itemsByName[args.itemName];
        if (!itemInfo) return `找不到物品 ${args.itemName}`;

        let craftingTable: any = undefined;
        if (args.useCraftingTable) {
            // @ts-ignore
            const tableId = this.env.core.registry.blocksByName.crafting_table.id;
            const tables = this.env.core.findBlocks({
                matching: tableId,
                maxDistance: 4,
                count: 1
            });
            
            if (tables.length === 0) {
                return '需要工作台，但附近沒有找到 crafting_table。';
            }
            craftingTable = this.env.core.blockAt(tables[0]);
        }

        const recipes = this.env.core.recipesFor(itemInfo.id, null, 1, craftingTable);
        if (recipes.length === 0) {
            return `無法合成 ${args.itemName}，可能缺少材料或配方錯誤。`;
        }
        
        const count = args.count || 1;
        try {
            await this.env.core.craft(recipes[0], count, craftingTable);
            // @ts-ignore
            if (this.state && this.state.update) this.state.update('last_crafted', `${args.itemName} x${count}`);
            return `成功合成了 ${count} 個 ${args.itemName}`;
        } catch (err: any) {
            return `合成失敗: ${err.message}`;
        }
    }
}
