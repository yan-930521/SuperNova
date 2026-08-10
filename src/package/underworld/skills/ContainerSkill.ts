import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export default class ContainerSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'container_skill';
    public readonly description = '處理箱子的開啟。利用 openContainer 進行 withdraw (提領) 和 deposit (存放)。';

    public async execute(args?: { action: 'withdraw' | 'deposit', itemName: string, count?: number }): Promise<string> {
        if (!args || !args.action || !args.itemName) return '必須提供 action 和 itemName';
        
        // @ts-ignore
        const itemInfo = this.env.core.registry.itemsByName[args.itemName];
        if (!itemInfo) return `找不到物品 ${args.itemName}`;

        // @ts-ignore
        const chestId = this.env.core.registry.blocksByName.chest.id;
        const chestBlocks = this.env.core.findBlocks({
            matching: chestId,
            maxDistance: 4,
            count: 1
        });

        if (chestBlocks.length === 0) {
            return '附近沒有找到箱子 (chest)。';
        }

        const chestBlock = this.env.core.blockAt(chestBlocks[0]);
        if (!chestBlock) return '無法讀取箱子方塊。';

        try {
            const container = await this.env.core.openContainer(chestBlock);
            const count = args.count || 1;

            if (args.action === 'withdraw') {
                // @ts-ignore
                await container.withdraw(itemInfo.id, null, count);
                await container.close();
                return `成功從箱子取出 ${count} 個 ${args.itemName}`;
            } else if (args.action === 'deposit') {
                // @ts-ignore
                await container.deposit(itemInfo.id, null, count);
                await container.close();
                return `成功將 ${count} 個 ${args.itemName} 存入箱子`;
            }
            
            await container.close();
            return '未知的容器操作';
        } catch (err: any) {
            return `容器操作失敗: ${err.message}`;
        }
    }
}
