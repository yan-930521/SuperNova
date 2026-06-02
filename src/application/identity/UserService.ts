import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { IUserRepository } from '../../infra/persistence/IRepository';
import { UserDTO } from '../../infra/types/identity';
import { recorder } from '../../infra/LogManager';

/**
 * UserService (用戶服務)
 * 負責處理用戶身份驗證、權限管理與基本偏好設定。
 * 取代舊有的 UserManager。
 */
export class UserService implements ILifecycle {
  constructor(
    private readonly userRepo: IUserRepository<UserDTO>
  ) {}

  /**
   * 生命週期：初始化
   */
  async initialize(): Promise<void> {
    recorder.info('[UserService] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[UserService] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    recorder.info('[UserService] Stopped', { type: 'SYSTEM' });
  }

  /**
   * 根據 ID 查找用戶
   */
  public async getUser(id: string): Promise<UserDTO | null> {
    return await this.userRepo.load(id);
  }

  /**
   * 建立或更新用戶
   */
  public async saveUser(user: UserDTO): Promise<void> {
    await this.userRepo.save(user);
    recorder.info(`[UserService] Saved user profile: ${user.id}`, { type: 'SYSTEM' });
  }
}
