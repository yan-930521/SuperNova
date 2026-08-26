import { ActionSkill } from '@core/skill/BaseSkill';
import { IBody } from '../../novalink/novalink-sdk/IBody';

export default class ContainerSkill extends ActionSkill<IBody> {
    public readonly name = 'containerskill';
    public readonly description = '此技能已轉移至 NovaLink 架構，部分功能仍在等待 RPC 擴充。';

    public async execute(args: any): Promise<string> {
        throw new Error('[Error] 此技能 (Mineflayer API) 已失效。NovaLink 尚未實作此功能的底層 RPC 介面，請等待後續更新。');
    }
}