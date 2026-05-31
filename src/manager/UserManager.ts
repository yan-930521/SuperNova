import { recorder } from '../infra/LogManager';
import { User } from '../models/User';
import { BaseManager } from './BaseManager';

/**
 * 用戶生命週期管理器 (UserManager)
 * 負責管理活躍用戶實體，並協調 Repository 進行持久化。
 */
export class UserManager extends BaseManager {
  private activeUsers: Map<string, User> = new Map();

  constructor() {
    super();
  }

  /**
   * 獲取用戶實體
   * 採緩存優先策略。
   */
  async getUser(id: string): Promise<User | null> {
    // 1. 檢查緩存
    if (this.activeUsers.has(id)) {
      return this.activeUsers.get(id)!;
    }

    // 2. 從儲存庫加載
    const dto = await this.runtime.userRepo.findById(id);
    if (dto) {
      const user = new User(dto.id, dto.name);
      user.fromDTO(dto);
      this.activeUsers.set(id, user);
      return user;
    }

    return null;
  }

  /**
   * 創建新用戶
   */
  async createUser(id: string, name: string): Promise<User> {
    recorder.info(`[UserManager] Creating new user: ${id} (${name})`, { type: 'LIFECYCLE' });
    const user = new User(id, name);
    await this.runtime.userRepo.save(user.toDTO());
    this.activeUsers.set(id, user);
    return user;
  }

  /**
   * 持久化用戶狀態
   */
  async saveUser(id: string): Promise<void> {
    const user = this.activeUsers.get(id);
    if (user) {
      await this.runtime.userRepo.save(user.toDTO());
    }
  }
}
