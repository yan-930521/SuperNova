/**
 * 領域邏輯系統接口 (Vertical System)
 * 定義了特定業務領域或專業知識模組的行為規範。
 */
export interface IVerticalSystem {
  /** 領域系統名稱，用於唯一標識 */
  name: string;

  /** 
   * 初始化領域系統並與特定會話綁定
   * @param session_id 關聯的會話 UUID
   */
  initialize(session_id: string): Promise<void>;

  /** 
   * 獲取該領域專屬的任務規劃器 (Planner)
   * 規劃器負責根據領域知識拆解目標為具體任務。
   */
  getPlanner(): any;
}
