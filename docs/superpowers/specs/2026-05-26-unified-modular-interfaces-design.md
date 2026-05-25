# SuperNova 2.0 全方位模塊化設計文檔 (Unified Modular Architecture)

## 1. 背景與目標
SuperNova 2.0 旨在從「原型玩具」進化為「工業級 AI 運行時」。為了實現這一點，我們需要將核心系統功能抽象化為一組標準介面，使底層實現（如儲存、模型、執行環境）可以無縫替換，而不需要修改業務邏輯。

## 2. 核心設計原則
- **接口優先 (Interface-First)**: 所有業務模塊僅依賴於抽象介面。
- **即時規劃 (Just-in-Time Planning)**: 廢除一次性大瀑布規劃，改為「規劃-執行-反饋-再規劃」的循環。
- **用戶中心 (User-Centric)**: 所有操作與數據均具備明確的用戶歸屬。

## 3. 核心介面定義

### 3.1 身份層 (Identity)

#### `UserDTO` & `IUserRepository`
```typescript
export interface UserDTO {
  id: string;
  name: string;
  preferences: Record<string, any>;
  apiKeys: Record<string, string>;
}

export interface IUserRepository {
  findById(id: string): Promise<UserDTO | null>;
  save(user: UserDTO): Promise<void>;
}
```

#### `UserManager`
負責用戶緩存、偏好設置的動態加載與權限校驗。
```typescript
export class UserManager {
  constructor(private repo: IUserRepository) {}
  async getUser(id: string): Promise<UserEntity | null>;
}
```

### 3.2 會話層 (Session)

#### `SessionDTO` & `ISessionRepository`
```typescript
export interface SessionDTO {
  id: string;
  userId: string;
  goal: string;
  status: string;
  history: any[]; // 存儲序列化後的訊息
  metadata: Record<string, any>;
}

export interface ISessionRepository {
  save(session: SessionDTO): Promise<void>;
  findById(id: string): Promise<SessionDTO | null>;
  findByUser(userId: string): Promise<SessionDTO[]>;
}
```

#### `SessionManager`
負責活動會話的生命週期、事件訂閱與內存管理。

### 3.3 任務層 (Task)

#### `TaskDTO` & `ITaskRepository`
```typescript
export interface TaskDTO {
  id: string;
  sessionId: string;
  goal: string;
  status: string;
  assignedAgentId?: string;
  dependencies: string[];
  result?: any;
}

export interface ITaskRepository {
  save(task: TaskDTO): Promise<void>;
  findBySession(sessionId: string): Promise<TaskDTO[]>;
  findById(id: string): Promise<TaskDTO | null>;
}
```

#### `TaskManager`
負責任務的 JIT 規劃、並行調度執行與錯誤重試邏輯。

### 3.4 代理層 (Agent)

#### `AgentDTO` & `IAgentRepository`
儲存代理的靜態配置、角色定義、能力清單與模型偏好。
```typescript
export interface AgentDTO {
  id: string;
  role: string;
  identity: string;      // 系統提示詞片段
  capabilities: string[]; // 擁有的能力標籤
  modelPreset: string;   // 偏好的模型預設 (FAST/SMART/EVAL)
  config: Record<string, any>;
}

export interface IAgentRepository {
  findById(id: string): Promise<AgentDTO | null>;
  findAll(): Promise<AgentDTO[]>;
  save(agent: AgentDTO): Promise<void>;
}
```

#### `AgentManager` (原 AgentRegistry)
負責將 `AgentDTO` 實例化為 `BaseAgent` 子類（如 `WorkerAgent`），管理活躍代理的註冊與查詢。

### 3.5 智能適配層 (Inference Adapter)

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
