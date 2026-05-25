# SuperNova 2.0 全方位模塊化設計文檔 (Unified Modular Architecture)

## 1. 背景與目標
SuperNova 2.0 旨在從「原型玩具」進化為「工業級 AI 運行時」。為了實現這一點，我們需要將核心系統功能抽象化為一組標準介面，使底層實現（如儲存、模型、執行環境）可以無縫替換，而不需要修改業務邏輯。

## 2. 核心設計原則
- **接口優先 (Interface-First)**: 所有業務模塊僅依賴於抽象介面。
- **即時規劃 (Just-in-Time Planning)**: 廢除一次性大瀑布規劃，改為「規劃-執行-反饋-再規劃」的循環。
- **用戶中心 (User-Centric)**: 所有操作與數據均具備明確的用戶歸屬。

## 3. 核心介面定義

### 3.1 身份與儲存層 (Identity & Storage)

#### `IUser` & `IUserRepository`
管理用戶畫像、偏好與權限。
```typescript
export interface IUser {
  id: string;
  name: string;
  preferences: Record<string, any>;
  apiKeys: Record<string, string>;
}

export interface IUserRepository {
  findById(id: string): Promise<IUser | null>;
  save(user: IUser): Promise<void>;
}
```

#### `ISessionRepository`
領域儲存庫模式，負責會話層數據。
```typescript
export interface ISession {
  id: string;
  userId: string;
  goal: string;
  status: 'ACTIVE' | 'ARCHIVED';
  summary?: string;
}

export interface ISessionRepository {
  create(userId: string, goal: string): Promise<ISession>;
  findById(id: string): Promise<ISession | null>;
  findByUser(userId: string): Promise<ISession[]>;
  update(session: ISession): Promise<void>;
}
```

### 3.2 智能適配層 (Inference Adapter)

#### `IInferenceAdapter`
包裝底層 LLM 供應商，專注於結構化輸出。
```typescript
export interface IInferenceAdapter {
  infer<T>(
    prompt: string, 
    schema: ZodSchema<T>, 
    options?: { temperature?: number, userId?: string }
  ): Promise<T>;
}
```

### 3.3 通訊與觀測層 (Event Bus)

#### `IEventBus`
強型別主題式通訊。
```typescript
export enum SystemEventType {
  SESSION_CREATED = 'SESSION_CREATED',
  TASK_STARTED = 'TASK_STARTED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  PLAN_UPDATED = 'PLAN_UPDATED'
}

export interface ISystemEvent<T = any> {
  type: SystemEventType;
  userId: string;
  sessionId: string;
  payload: T;
  timestamp: number;
}

export interface IEventBus {
  publish(event: ISystemEvent): void;
  subscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void;
}
```

### 3.4 任務與執行層 (Task & Execution)

#### `ITaskManager` (JIT 模式)
不再一次性生成所有任務，而是管理 Milestone 的動態展開。
```typescript
export interface ITaskManager {
  submitGoal(userId: string, sessionId: string, goal: string): Promise<void>;
  getNextRunnableTask(sessionId: string): Promise<TaskNode | null>;
  reportTaskResult(taskId: string, result: any): Promise<void>;
}
```

#### `IExecutionContext` (Sandbox)
環境級適配器，為工具提供受控執行環境。
```typescript
export interface IExecutionContext {
  userId: string;
  workspacePath: string;
  executeTool(toolName: string, input: any): Promise<any>;
  // 未來可替換為 DockerExecutionContext 實作
}
```

## 4. 實施策略：輕量級工廠 (Lightweight Factory)
使用一個全局配置器來決定介面的具體實作，避免複雜的 DI 框架。

```typescript
export class GlobalRegistry {
  static sessionRepo: ISessionRepository;
  static userRepo: IUserRepository;
  static eventBus: IEventBus;
  // ... 其他
}
```

## 5. 待辦事項 (Roadmap)
1. [ ] 重構 `src/infra/` 以符合新介面。
2. [ ] 實現 `FileSystemSessionRepository` 作為初始儲存方案。
3. [ ] 修改 `TaskPlanner` 與 `TaskManager` 改用 JIT 邏輯。
