/**
 * @file IBody.ts
 * 你的肉體化身 (Avatar) 介面。
 * 這些方法代表你在 Minecraft 世界中能夠執行的所有行動與感知能力。
 */

import type { MobStatus, PathStatus, NearbyEntity, BlockHit } from "./types";

export interface IBody {
    // ==========================================
    // 物理移動 (Movement)
    // ==========================================

    /**
     * 走向指定的絕對座標。
     * 你具備自動繞過障礙物與尋路的能力。
     * 
     * @param x 目標 X 座標
     * @param y 目標 Y 座標
     * @param z 目標 Z 座標
     * @param speed 你的移動速度乘數，預設為 1.0 (正常步速)。
     * @returns true 代表成功找到路徑並邁出腳步，false 代表完全無法找到路徑 (例如死胡同)。
     */
    moveTo(x: number, y: number, z: number, speed?: number): Promise<boolean>;

    /**
     * 立刻煞車，停止當前的一切移動。
     */
    stopMove(): Promise<boolean>;

    /**
     * 轉動你的頭部，看向指定的絕對座標。
     */
    lookAt(x: number, y: number, z: number): Promise<boolean>;

    /**
     * 轉動你的頭部，持續鎖定並注視著某個特定的實體。
     * 該實體必須在你的周圍 64 格之內。
     * @param targetUuid 想注視的實體 UUID
     */
    lookAtEntity(targetUuid: string): Promise<boolean>;

    /**
     * 原地跳躍一次。若你正在水中，則會產生游泳上升的效果。
     */
    jump(): Promise<boolean>;

    // ==========================================
    // 互動與戰鬥 (Interaction & Combat)
    // ==========================================

    /**
     * 揮動武器攻擊指定的目標。
     * 注意：如果目標超出你的近戰範圍 (約 3 格)，你依然會揮動手臂，但不會造成任何傷害。
     * 建議先移動靠近目標後再發動攻擊。
     * @param targetUuid 要攻擊的目標 UUID
     */
    attack(targetUuid: string): Promise<boolean>;

    /**
     * 單純揮動手臂 (無攻擊判定)。
     * 可用於向其他玩家打招呼或表達情緒。
     * @param hand 選擇揮動 "main" (主手) 或 "off" (副手)
     */
    swingArm(hand?: "main" | "off"): Promise<boolean>;

    /**
     * 開口說話。
     * 你的發言將會被周圍 30 格內的玩家聽見。
     * @param message 說話內容
     */
    say(message: string): Promise<boolean>;

    // ==========================================
    // 感知與確認 (Perception)
    // ==========================================

    /**
     * 感受你自己當前的生理與環境狀態。
     * 包含血量、精確座標、以及是否著火/在水中。
     */
    getStatus(): Promise<MobStatus>;

    /**
     * 確認你自己的尋路進度。
     * 當你下達 moveTo 後，可定期檢查 is_moving 是否變成 false，
     * 以判斷自己是否已經順利抵達目的地。
     */
    getPathStatus(): Promise<PathStatus>;

    /**
     * 檢查你自己全身上下的裝備與手持物品。
     */
    getEquipment(): Promise<Record<string, string>>;

    /**
     * 環顧四周，掃描附近的所有實體。
     * 可用來尋找周遭是否有怪物、動物或玩家。
     * @param radius 掃描半徑 (預設 10.0 格)
     */
    getNearbyEntities(radius?: number): Promise<NearbyEntity[]>;

    /**
     * 注視正前方，確認你的視線正中央看著什麼方塊。
     * 可用來判斷眼前是否有牆壁或障礙物。
     * @param distance 最遠視距 (預設 5.0 格)
     */
    rayTraceBlocks(distance?: number): Promise<BlockHit>;
}
