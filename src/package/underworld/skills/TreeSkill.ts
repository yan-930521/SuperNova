import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export default class TreeSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'tree_skill';
    public readonly description = '尋找並砍伐附近的樹木，包含自動挖掘相鄰的木頭。';

    public async execute(args?: any): Promise<string> {
        const radius = args?.radius || 32;

        // 搜尋附近的 log 方塊
        const logBlocks = this.env.core.findBlocks({
            matching: (block: any) => block.name.includes('log'),
            maxDistance: radius,
            count: 1
        });

        if (logBlocks.length === 0) {
            this.state.update('tree_search', `在半徑 ${radius} 內找不到任何樹木`);
            return `在半徑 ${radius} 內找不到任何樹木`;
        }

        const targetPos = logBlocks[0];
        const targetBlock = this.env.core.blockAt(targetPos);
        
        if (!targetBlock) {
             return '無法獲取目標方塊資訊';
        }

        this.state.update('tree_search', `找到樹木位於 ${targetPos.x}, ${targetPos.y}, ${targetPos.z}，開始前往砍伐`);
        
        // 移動到樹木旁邊
        this.env.moveTo(targetPos.x, targetPos.y, targetPos.z);
        
        // 等待移動 (簡化處理)
        let timeout = 0;
        while(this.env.isMoving() && timeout < 200) {
            await new Promise(r => setTimeout(r, 100));
            timeout++;
        }

        // 開始砍伐相鄰的同類木頭 (BFS)
        let chopped = 0;
        const toChop = [targetPos];
        const visited = new Set<string>();

        while (toChop.length > 0 && chopped < 50) { // 最多砍 50 個方塊以防卡死
            const currentPos = toChop.pop()!;
            const posKey = `${currentPos.x},${currentPos.y},${currentPos.z}`;
            if (visited.has(posKey)) continue;
            visited.add(posKey);

            const block = this.env.core.blockAt(currentPos);
            if (!block || !block.name.includes('log')) {
                continue;
            }

            // 如果距離太遠則再次靠近
            if (this.env.core.entity.position.distanceTo(currentPos) > 5) {
                 this.env.moveTo(currentPos.x, currentPos.y, currentPos.z);
                 let innerTimeout = 0;
                 while(this.env.isMoving() && innerTimeout < 50) {
                    await new Promise(r => setTimeout(r, 100));
                    innerTimeout++;
                 }
            }

            try {
                await this.env.digBlock(block, true);
                chopped++;
            } catch (err) {
                console.error(`挖掘方塊失敗: ${err}`);
                break; 
            }

            // 將相鄰方塊加入佇列
            const neighbors = [
                currentPos.offset(0, 1, 0),
                currentPos.offset(0, -1, 0),
                currentPos.offset(1, 0, 0),
                currentPos.offset(-1, 0, 0),
                currentPos.offset(0, 0, 1),
                currentPos.offset(0, 0, -1),
            ];
            toChop.push(...neighbors);
        }
        
        this.env.stopMoving();
        const resultMsg = `成功砍伐了 ${chopped} 個木頭方塊。`;
        this.state.update('tree_chopped', resultMsg);
        return resultMsg;
    }
}
