import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';
import { Vec3 } from 'vec3';

export default class FarmSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'farm_skill';
    public readonly description = '尋找成熟的農作物進行採收，並自動種回種子。';

    public async execute(args?: any): Promise<string> {
        const radius = args?.radius || 16;
        
        const cropNames = ['wheat', 'carrots', 'potatoes', 'beetroots'];
        
        // 搜尋成熟的作物
        const matureBlocks = this.env.core.findBlocks({
            matching: (block: any) => {
                if (!cropNames.includes(block.name)) return false;
                // metadata 7 一般為小麥、胡蘿蔔、馬鈴薯的成熟階段，beetroots 可能為 3
                return block.metadata === 7 || block.metadata === 3;
            },
            maxDistance: radius,
            count: 10
        });

        if (matureBlocks.length === 0) {
            this.state.update('farm_status', '附近沒有發現成熟的農作物');
            return '附近沒有發現成熟的農作物';
        }

        let harvested = 0;
        let replanted = 0;

        for (const blockPos of matureBlocks) {
            const block = this.env.core.blockAt(blockPos);
            if (!block) continue;
            const blockName = block.name;

            // 移動到作物附近
            this.env.moveTo(blockPos.x, blockPos.y, blockPos.z);
            let timeout = 0;
            while(this.env.isMoving() && timeout < 100) {
                await new Promise(r => setTimeout(r, 100));
                timeout++;
            }

            try {
                // 進行採收
                await this.env.digBlock(block, false);
                harvested++;
                
                // 尋找對應的種子準備種回
                let seedName = 'wheat_seeds';
                if (blockName === 'carrots') seedName = 'carrot';
                if (blockName === 'potatoes') seedName = 'potato';
                if (blockName === 'beetroots') seedName = 'beetroot_seeds';

                const seedItem = this.env.core.inventory.items().find(item => item.name === seedName);
                if (seedItem) {
                    await this.env.core.equip(seedItem, 'hand');
                    const dirtBlock = this.env.core.blockAt(blockPos.offset(0, -1, 0));
                    
                    if (dirtBlock && dirtBlock.name === 'farmland') {
                         await this.env.core.placeBlock(dirtBlock, new Vec3(0, 1, 0));
                         replanted++;
                    }
                }
            } catch (err) {
                console.error(`農作失敗: ${err}`);
            }
        }
        
        this.env.stopMoving();
        const resultMsg = `農作任務完成：共採收 ${harvested} 個作物，並重新種植了 ${replanted} 個種子。`;
        this.state.update('farm_status', resultMsg);
        return resultMsg;
    }
}
