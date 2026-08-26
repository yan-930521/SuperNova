/**
 * @file NovaLink.d.ts
 * 專門提供給 AI Agent (LLM) 閱讀的 TypeScript 型別定義檔。
 * 定義了 Agent 附身於 Minecraft 實體後，所能感知到的狀態與可執行的操作。
 */

export type Vector3 = [number, number, number];

export interface MobStatus {
    hp: number;
    max_hp: number;
    pos: Vector3;
    yaw: number;
    pitch: number;
    on_ground: boolean;
    in_water: boolean;
    is_on_fire: boolean;
    armor_value: number;
}

export interface PathStatus {
    is_moving: boolean;
    can_reach_target?: boolean;
    target_pos?: Vector3 | null;
    path_length?: number;
    current_node?: number;
}

export interface NearbyEntity {
    uuid: string;
    type: string;
    distance: number;
}

export interface BlockHit {
    type: "block" | "miss";
    block?: string;
    pos?: Vector3;
}

/**
 * 你的肉體化身 (Avatar) 介面。
 * 這些方法代表你在 Minecraft 世界中能夠執行的所有行動與感知能力。
 */
export interface IBody {
    // === 物理移動 (Movement) ===
    /**
     * 走向指定的絕對座標。具備自動繞過障礙物與尋路的能力。
     * @param x 目標 X 座標
     * @param y 目標 Y 座標
     * @param z 目標 Z 座標
     * @param speed 移動速度乘數，預設 1.0
     * @returns true 代表成功找到路徑並邁出腳步，false 代表無法抵達
     */
    moveTo(x: number, y: number, z: number, speed?: number): Promise<boolean>;

    /** 立刻煞車，停止當前的一切移動。 */
    stopMove(): Promise<boolean>;

    /** 轉動你的頭部，看向指定的絕對座標。 */
    lookAt(x: number, y: number, z: number): Promise<boolean>;

    /** 轉動頭部，鎖定並注視周圍 64 格內的特定實體。 */
    lookAtEntity(targetUuid: string): Promise<boolean>;

    /** 原地跳躍一次。若在水中則會產生游泳上升的效果。 */
    jump(): Promise<boolean>;


    // === 互動與戰鬥 (Interaction & Combat) ===
    /**
     * 揮動武器攻擊指定的目標 (需在近戰範圍約 3 格內)。
     * @param targetUuid 要攻擊的目標 UUID
     */
    attack(targetUuid: string): Promise<boolean>;

    /**
     * 單純揮動手臂 (無攻擊判定)。
     * @param hand "main" (主手) 或 "off" (副手)
     */
    swingArm(hand?: "main" | "off"): Promise<boolean>;

    /**
     * 開口說話，會廣播給周圍 30 格內的玩家聽見。
     */
    say(message: string): Promise<boolean>;


    // === 感知與確認 (Perception) ===
    /** 感受你自己當前的生理與環境狀態 (血量、精確座標等)。 */
    getStatus(): Promise<MobStatus>;

    /** 確認你自己的尋路進度。 */
    getPathStatus(): Promise<PathStatus>;

    /** 檢查你自己全身上下的裝備與手持物品。 */
    getEquipment(): Promise<Record<string, string>>;

    /**
     * 環顧四周，掃描附近的所有實體。
     * @param radius 掃描半徑 (預設 10.0 格)
     */
    getNearbyEntities(radius?: number): Promise<NearbyEntity[]>;

    /**
     * 注視正前方，確認你的視線正中央看著什麼方塊。
     * @param distance 最遠視距 (預設 5.0 格)
     */
    rayTraceBlocks(distance?: number): Promise<BlockHit>;
}

/**
 * 全域環境變數 env，當 Agent 執行 CodeSkill 時，
 * 可以透過 this.body (其型別為 IBody) 來呼叫這些能力。
 */
declare const body: IBody;
