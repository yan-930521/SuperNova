import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';

export default class TerrainSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'TerrainSkill';
    public readonly description = '透過 findBlocks 搜尋周遭特定方塊，將座標轉換為提示字串回傳並寫入狀態。';

    public async execute(args?: any): Promise<string> {
        // 邊界情況防護：確保 args 與 blockName 有被正確傳入
        if (!args || !args.blockName) {
            throw new Error('TerrainSkill 需要提供 blockName 參數以搜尋方塊');
        }

        const { blockName, maxDistance = 32, count = 10 } = args;

        // 取得方塊 ID，避免底層報錯
        const blockType = this.env.core.registry.blocksByName[blockName];
        if (!blockType) {
            return `無法辨識的方塊名稱: ${blockName}`;
        }

        // 搜尋周遭環境中符合 ID 的方塊
        const blockVecs = this.env.core.findBlocks({
            matching: blockType.id,
            maxDistance,
            count
        });

        if (blockVecs.length === 0) {
            const msg = `在半徑 ${maxDistance} 內未找到任何 ${blockName}`;
            // 記錄失敗的搜尋結果
            this.state.update('terrain_search_result', { blockName, found: 0 });
            return msg;
        }

        // 整理查找到的特定方塊座標為字串
        const coords = blockVecs.map(v => `(${v.x}, ${v.y}, ${v.z})`).join(', ');
        
        // 狀態回報：將尋找結果寫入 StateRegistry 供其他模組參考
        this.state.update('terrain_search_result', {
            blockName,
            locations: blockVecs,
            found: blockVecs.length
        });

        // 將座標轉換為提示字串回傳
        return `在附近共找到 ${blockVecs.length} 個 ${blockName}，座標如下: ${coords}`;
    }
}
