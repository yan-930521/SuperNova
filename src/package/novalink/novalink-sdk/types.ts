/**
 * @file types.ts
 * 定義你在 Minecraft 世界中所能感知的各種狀態與資料結構。
 */

export type Vector3 = [number, number, number];

/**
 * 你的生理與環境狀態。
 * 包含生命值、座標與物理環境的感知。
 */
export interface MobStatus {
    /** 你當前的生命值 (若小於等於 0 代表已死亡) */
    hp: number;
    /** 你的最大生命值 */
    max_hp: number;
    /** 你在世界中的絕對座標 [X, Y, Z] */
    pos: Vector3;
    /** 你的水平視角 (偏航角)，0 為正南，-90 為正東 */
    yaw: number;
    /** 你的垂直視角 (俯仰角)，負值朝上，正值朝下 */
    pitch: number;
    /** 你的雙腳是否踩在方塊上。若為 false 可能代表你正在墜落或跳躍。 */
    on_ground: boolean;
    /** 你是否處於水中。若為 true 請注意是否需要游泳以免溺水。 */
    in_water: boolean;
    /** 你是否正在燃燒，這會讓你持續失去生命值。 */
    is_on_fire: boolean;
    /** 你的總護甲值，能減免你受到的物理傷害。 */
    armor_value: number;
}

/**
 * 你的移動與尋路狀態。
 * 用於確認你是否已經走到目標地點。
 */
export interface PathStatus {
    /** 你是否正在移動中 (true 代表仍在走，false 代表已抵達或已停下) */
    is_moving: boolean;
    /** 你是否能夠完全走到目標座標 (若為 false 可能是目標在空中或被牆壁封死) */
    can_reach_target?: boolean;
    /** 你當前正試圖走去的終點座標 */
    target_pos?: Vector3 | null;
    /** 你的整趟旅途總共需要經過多少個節點 */
    path_length?: number;
    /** 你目前已經走到第幾個節點 (可用於評估進度) */
    current_node?: number;
}

/**
 * 周圍實體雷達的回傳資料。
 * 你可以藉此知道附近有哪些生物或玩家。
 */
export interface NearbyEntity {
    /** 該實體的唯一識別碼 (UUID)，可用於發動攻擊或視角鎖定 */
    uuid: string;
    /** 該實體的種類 (例如: "minecraft:zombie", "minecraft:player") */
    type: string;
    /** 該實體與你之間的直線距離 (方塊數) */
    distance: number;
}

/**
 * 你視線前方的方塊檢測結果。
 */
export interface BlockHit {
    /** 'block' 代表你看到實體方塊，'miss' 代表視線範圍內只有空氣 */
    type: "block" | "miss";
    /** 該方塊的名稱 (例如: "minecraft:stone") */
    block?: string;
    /** 該方塊的絕對座標 */
    pos?: Vector3;
}
