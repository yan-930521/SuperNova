import { UserDTO } from '../../infra/types/identity';

/**
 * User (用戶實體)
 * 負責處理單個用戶的業務邏輯，如權限檢查、偏好設置合併等。
 */
export class User {
  public preferences: Record<string, any> = {};
  public apiKeys: Record<string, string> = {};

  constructor(
    public readonly id: string,
    public name: string
  ) {}

  /**
   * 將 DTO 數據注入實體
   */
  fromDTO(dto: UserDTO): void {
    this.name = dto.name;
    this.preferences = dto.preferences || {};
    this.apiKeys = dto.apiKeys || {};
  }

  /**
   * 轉換為 DTO 用於持久化
   */
  toDTO(): UserDTO {
    return {
      id: this.id,
      name: this.name,
      preferences: this.preferences,
      apiKeys: this.apiKeys
    };
  }

  /**
   * 獲取特定的 API Key
   */
  getApiKey(provider: string): string | undefined {
    return this.apiKeys[provider];
  }

  /**
   * 更新偏好設置
   */
  updatePreference(key: string, value: any): void {
    this.preferences[key] = value;
  }
}
