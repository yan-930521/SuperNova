import { IUserRepository } from './types/identity';
import { ISessionRepository } from './types/storage';
import { IEventBus } from './types/events';

/**
 * GlobalRegistry 用於管理全域相依項目。
 * 這是一個靜態類別，提供對 User Repository、Session Repository 及 Event Bus 的存取。
 */
export class GlobalRegistry {
  private static _userRepo: IUserRepository;
  private static _sessionRepo: ISessionRepository;
  private static _eventBus: IEventBus;

  static set userRepo(repo: IUserRepository) { this._userRepo = repo; }
  static get userRepo() { return this._userRepo; }

  static set sessionRepo(repo: ISessionRepository) { this._sessionRepo = repo; }
  static get sessionRepo() { return this._sessionRepo; }

  static set eventBus(bus: IEventBus) { this._eventBus = bus; }
  static get eventBus() { return this._eventBus; }
}
