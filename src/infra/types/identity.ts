/**
 * 用戶數據傳輸對象 (User Data Transfer Object)
 * 代表系統中的使用者身份，包含基本資訊、偏好設置與授權金鑰。
 */
export interface UserDTO {
  /** 用戶唯一識別碼 (UUID 或自定義 ID) */
  id: string;
  /** 用戶顯示名稱 */
  name: string;
  /** 用戶個人偏好設定，如界面語言、提示詞風格等 */
  preferences: Record<string, any>;
  /** 用戶配置的外部服務 API Key (加密存儲或環境變數映射) */
  apiKeys: Record<string, string>;
}

/**
 * 用戶儲存庫接口
 * 負責 UserDTO 的持久化操作，屏蔽底層儲存媒介 (如文件系統、資料庫) 的差異。
 */
export interface IUserRepository {
  /**
   * 根據 ID 查找用戶
   * @param id 用戶識別碼
   * @returns 返回用戶數據，若不存在則返回 null
   */
  findById(id: string): Promise<UserDTO | null>;

  /**
   * 保存或更新用戶數據
   * @param user 用戶數據對象
   */
  save(user: UserDTO): Promise<void>;
}
