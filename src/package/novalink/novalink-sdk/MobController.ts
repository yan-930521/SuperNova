/**
 * @file MobController.ts
 * 負責單一 Minecraft 生物 (Mob) 的實體控制邏輯。
 * 將底層的 RPC 呼叫封裝成帶有嚴格型別的高階物件導向介面，
 * 極大化減輕 LLM 撰寫 CodeSkill 時的心智負擔。
 */

import { RpcClient } from "./RpcClient";
import type { MobStatus, PathStatus, NearbyEntity, BlockHit } from "./types";
import type { IBody } from "./IBody";

export class MobController implements IBody {
    private client: RpcClient;
    public readonly uuid: string;

    constructor(client: RpcClient, uuid: string) {
        this.client = client;
        this.uuid = uuid;
    }

    // ==========================================
    // 導航與移動 (Movement)
    // ==========================================

    /**
     * 指示生物移動到指定的座標。內部使用 Minecraft A* 尋路演算法。
     * 
     * [邊界情況]：如果目標座標在封閉空間、死胡同，或半空中無法抵達，
     * 底層演算法會直接拒絕尋路並回傳 false。
     * 若回傳 true，代表已開始移動，可後續透過 `getPathStatus` 監控移動進度。
     * 
     * @param x 目標 X 座標
     * @param y 目標 Y 座標
     * @param z 目標 Z 座標
     * @param speed 移動速度乘數，預設為 1.0 (正常速度)。【潛在風險】數值過大可能導致實體移動抽搐或違反物理判定。
     * @returns true 代表成功計算出路徑並開始移動，false 代表完全無法找到路徑。
     */
    public async moveTo(x: number, y: number, z: number, speed: number = 1.0): Promise<boolean> {
        return this.client.call<boolean>("mob.moveTo", { uuid: this.uuid, x, y, z, speed });
    }

    /**
     * 強制中斷實體當前的尋路移動，讓實體立刻在原地煞車。
     * @returns 永遠回傳 true。
     */
    public async stopMove(): Promise<boolean> {
        return this.client.call<boolean>("mob.stopMove", { uuid: this.uuid });
    }

    /**
     * 強制轉動實體的頭部，使其視線看向指定的絕對座標。
     * 可用於表現 AI 的「注意力 (Attention)」方向。
     * @param x 目標 X 座標
     * @param y 目標 Y 座標
     * @param z 目標 Z 座標
     */
    public async lookAt(x: number, y: number, z: number): Promise<boolean> {
        return this.client.call<boolean>("mob.lookAt", { uuid: this.uuid, x, y, z });
    }

    /**
     * 強制轉動實體的頭部，持續鎖定並看向指定的實體。
     * [邊界情況]：為了防止遠距離透視作弊，目標實體必須位於周圍 64 格之內，否則會回傳 false。
     * @param targetUuid 想鎖定的目標實體 UUID
     * @returns true 代表成功鎖定，false 代表目標不存在或距離過遠。
     */
    public async lookAtEntity(targetUuid: string): Promise<boolean> {
        return this.client.call<boolean>("mob.lookAtEntity", { uuid: this.uuid, target_uuid: targetUuid });
    }

    /**
     * 命令實體原地跳躍一次。
     * 若實體處於水中，則會產生游泳上升的效果。
     */
    public async jump(): Promise<boolean> {
        return this.client.call<boolean>("mob.jump", { uuid: this.uuid });
    }

    // ==========================================
    // 互動與戰鬥 (Interaction & Combat)
    // ==========================================

    /**
     * 對指定 UUID 的實體發動近戰攻擊。
     * 
     * [潛在風險]：如果發動攻擊時，雙方距離超出近戰判定範圍 (通常為 3 格)，
     * 攻擊動作依然會發出，但不會對目標造成真實傷害。
     * 建議先搭配 `moveTo` 靠近目標後再發動。
     * 
     * @param targetUuid 要攻擊的目標實體 UUID
     * @returns true 代表成功發出攻擊指令，false 代表該目標不存在或距離過遠無法判定。
     */
    public async attack(targetUuid: string): Promise<boolean> {
        return this.client.call<boolean>("mob.attack", { uuid: this.uuid, target_uuid: targetUuid });
    }

    /**
     * 單純揮動手臂，無實際攻擊效果。
     * 用於向玩家傳達視覺提示 (例如招手或挖礦假動作)。
     * @param hand "main" (主手) 或 "off" (副手)
     */
    public async swingArm(hand: "main" | "off" = "main"): Promise<boolean> {
        return this.client.call<boolean>("mob.swingArm", { uuid: this.uuid, hand });
    }

    /**
     * 讓實體發言。此訊息會以格式 `<實體名稱> 訊息內容`，
     * 廣播給半徑 30 格內的所有玩家，模擬實體開口說話的效果。
     * @param message 說話內容
     */
    public async say(message: string): Promise<boolean> {
        return this.client.call<boolean>("mob.say", { uuid: this.uuid, message });
    }

    // ==========================================
    // 狀態與感知 (Perception)
    // ==========================================

    /**
     * 獲取實體當前的詳細生理與物理狀態。
     * 包含血量、精確座標、以及著火/水中等環境判定。
     */
    public async getStatus(): Promise<MobStatus> {
        return this.client.call<MobStatus>("mob.getStatus", { uuid: this.uuid });
    }

    /**
     * 獲取當前尋路 (Pathfinding) 的即時狀態。
     * 強烈建議在呼叫 `moveTo` 後，透過迴圈定期檢查 `is_moving` 是否變成 false，
     * 以判定實體是否已經到達目的地，避免 AI 陷入無窮等待。
     */
    public async getPathStatus(): Promise<PathStatus> {
        return this.client.call<PathStatus>("mob.getPathStatus", { uuid: this.uuid });
    }

    /**
     * 獲取該實體全身上下的 6 個裝備格 (主手、副手、頭、胸、腿、腳)。
     * @returns 一個物件，鍵為裝備槽名稱 (如 "mainhand")，值為物品的註冊名 (如 "minecraft:iron_sword")。空值為 "minecraft:air"。
     */
    public async getEquipment(): Promise<Record<string, string>> {
        return this.client.call<Record<string, string>>("mob.getEquipment", { uuid: this.uuid });
    }

    /**
     * 掃描周圍特定半徑內的所有實體。
     * 可用於尋找潛在的攻擊目標或是友善的村民。
     * @param radius 掃描半徑 (方塊距離)，預設為 10.0。數值越大伺服器負擔越重。
     * @returns 周圍實體的陣列列表，包含 UUID、種類與直線距離。
     */
    public async getNearbyEntities(radius: number = 10.0): Promise<NearbyEntity[]> {
        return this.client.call<NearbyEntity[]>("mob.getNearbyEntities", { uuid: this.uuid, radius });
    }

    /**
     * 模擬實體的視線，進行射線檢測 (RayTrace)。
     * 讓實體知道目前眼睛正中央注視著什麼實體方塊 (例如遇到牆壁或門)。
     * @param distance 視線射線的最遠距離，預設為 5.0 格。
     * @returns 命中方塊的名稱與座標，如果視線完全暢通沒有撞到方塊，則回傳 type = "miss"。
     */
    public async rayTraceBlocks(distance: number = 5.0): Promise<BlockHit> {
        return this.client.call<BlockHit>("mob.rayTraceBlocks", { uuid: this.uuid, distance });
    }
}
