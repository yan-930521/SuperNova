import { IUserRepository } from './types/identity';
import { ISessionRepository } from './types/storage';
import { IEventBus } from './types/events';
import { ITaskRepository } from './types/task';
import { IAgentRepository } from './types/agent';
import { UserManager } from '../manager/UserManager';
import { SessionManager } from '../manager/SessionManager';
import { AgentManager } from '../manager/AgentManager';
import { TaskManager } from '../manager/TaskManager';

/**
 * GlobalRegistry 用於管理全域相依項目。
 * 這是一個靜態類別，提供對 Repository 與 Manager 層的統一存取。
 */
export class GlobalRegistry {
  // --- Repositories (持久層) ---
  private static _userRepo: IUserRepository;
  private static _sessionRepo: ISessionRepository;
  private static _taskRepo: ITaskRepository;
  private static _agentRepo: IAgentRepository;
  
  // --- Managers (業務層) ---
  private static _userManager: UserManager;
  private static _sessionManager: SessionManager;
  private static _agentManager: AgentManager;
  private static _taskManager: TaskManager;
  
  // --- Bus (通訊層) ---
  private static _eventBus: IEventBus;

  // Repository Getters/Setters
  static set userRepo(repo: IUserRepository) { this._userRepo = repo; }
  static get userRepo() { return this._userRepo; }

  static set sessionRepo(repo: ISessionRepository) { this._sessionRepo = repo; }
  static get sessionRepo() { return this._sessionRepo; }

  static set taskRepo(repo: ITaskRepository) { this._taskRepo = repo; }
  static get taskRepo() { return this._taskRepo; }

  static set agentRepo(repo: IAgentRepository) { this._agentRepo = repo; }
  static get agentRepo() { return this._agentRepo; }

  // Manager Getters/Setters
  static set userManager(mgr: UserManager) { this._userManager = mgr; }
  static get userManager() { return this._userManager; }

  static set sessionManager(mgr: SessionManager) { this._sessionManager = mgr; }
  static get sessionManager() { return this._sessionManager; }

  static set agentManager(mgr: AgentManager) { this._agentManager = mgr; }
  static get agentManager() { return this._agentManager; }

  static set taskManager(mgr: TaskManager) { this._taskManager = mgr; }
  static get taskManager() { return this._taskManager; }

  // Bus Getter/Setter
  static set eventBus(bus: IEventBus) { this._eventBus = bus; }
  static get eventBus() { return this._eventBus; }
}
