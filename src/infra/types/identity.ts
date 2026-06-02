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
