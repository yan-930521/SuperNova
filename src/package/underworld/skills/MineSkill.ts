import { ActionSkill } from '@core/skill/BaseSkill';
import { SuperNovaBot } from '@underworld/wrapper/SuperNovaBot';
import { Vec3 } from 'vec3';

export default class MineSkill extends ActionSkill<SuperNovaBot> {
    public readonly name = 'MineSkill';
    public readonly description = '尋找目標方塊並進行挖掘，自動確保工具正確裝備並處理例外。';

    public async execute(args?: any): Promise<string> {
        // 邊界情況防護：確保座標有被正確傳入
        if (!args || args.x === undefined || args.y === undefined || args.z === undefined) {
            throw new Error('MineSkill 需要提供明確的座標 (x, y, z)');
        }

        const { x, y, z } = args;
        const targetPos = new Vec3(x, y, z);
        
        // 找出目標方塊實體
        const block = this.env.core.blockAt(targetPos);
        
        if (!block || block.name === 'air') {
            return `座標 (${x}, ${y}, ${z}) 處為空或無法讀取方塊資訊`;
        }

        try {
            // 狀態回報：記錄正在挖掘的目標
            this.state.update('mining_status', { 
                status: 'digging', 
                target: block.name, 
                position: targetPos 
            });

            // 呼叫高階 API digBlock 進行挖掘，第二個參數代表 requireHarvest (確保工具正確裝備)
            await this.env.digBlock(block, true);
            
            // 挖掘完成，清除挖掘狀態
            this.state.update('mining_status', { status: 'idle' });
            return `成功完成挖掘：位於 (${x}, ${y}, ${z}) 的 ${block.name}`;
            
        } catch (error: any) {
            // 捕捉 DiggingCompleted 或環境引發的 Error
            this.state.update('mining_status', { status: 'error', reason: error.message });
            return `挖掘方塊 ${block.name} 於 (${x}, ${y}, ${z}) 時發生異常: ${error.message || String(error)}`;
        }
    }
}
