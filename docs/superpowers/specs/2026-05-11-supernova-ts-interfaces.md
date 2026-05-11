# SuperNova TypeScript 接口設計規範 (Full Interface Spec)

*   **日期：** 2026-05-11
*   **狀態：** 待審修 (Ready for Codex Review)
*   **目標：** 為 SuperNova 架構提供一套嚴謹、強類型、且具備高度可序列化能力的 TypeScript 接口定義。

---

## 1. 語言與格式規範
- **代碼註解：** 使用中文進行詳細邏輯說明、參數解釋及邊界情況描述。
- **數據結構 Key：** 所有的 JSON 欄位、變數名、函數名、日誌輸出均使用英文。
- **異步風格：** 核心方法統一使用 `Promise`-based 異步模式。
- **類型風格：** 核心數據流使用強類型泛型 (Generics) 以確保端到端類型安全。

---

## 2. 核心數據模型 (Models) - `interfaces/models/`

### 2.1 Mutation & Event
```typescript
/**
 * 修改請求接口 (Mutation Request)
 * 描述 Agent 提出的系統規則修改建議。
 */
export interface IMutationRequest<T = any> {
  requester_id: string;    // 提出修改的 Agent ID
  target_hook: string;      // 打算修改的 Hook 名稱
  proposed_change: T;       // 提議變更的數據載體
  priority: number;         // 優先級 (1-100)
  version_ref: string;      // 版本參考標識 (MVCC)
}

/**
 * 事件對象 (Event)
 */
export type Event<T = any> = {
  type: string;             // 事件類型
  payload: T;               // 數據載體
  tags: string[];           // 用於 Hook 匹配的標籤
  trace_context: {          // 全鏈路追蹤上下文
    session_id: string;
    trace_id: string;
  };
}
```

---

## 3. 會話執行模組 (Session) - `interfaces/session/`

### 3.1 ISession
```typescript
/**
 * 會話核心接口
 */
export interface ISession {
  id: string;               // 會話 UUID
  status: string;           // 當前狀態
  goal: string;             // 初始目標
  
  /** 驅動會話運行的核心循環 */
  tick(): Promise<void>;
  
  /** 導出全鏈路操作日誌 */
  exportLog(): Promise<string>;

  /** 序列化為 JSON */
  toJSON(): Record<string, any>;
  
  /** 從 JSON 加載狀態 */
  loadFromJSON(data: Record<string, any>): Promise<void>;
}
```

---

## 4. 運行時與穩定性 (Runtime & Guardian) - `interfaces/runtime/`

### 4.1 IRuntime & IGuardian
```typescript
/**
 * 全局運行時大腦
 */
export interface IRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  getActiveSessions(): Record<string, ISession>;
  emitGlobalEvent(event: Event): void;
}

/**
 * 穩定性守護接口
 */
export interface IGuardian {
  /** 在防護模式下執行異步任務，提供 Timeout 與 Exception 隔離 */
  protect<T>(task: () => Promise<T>, timeout: number): Promise<T>;
  
  /** 錯誤恢復策略裁決 */
  resolveStrategy(error: Error): 'RETRY' | 'ABORT' | 'IGNORE';
}
```

---

## 5. Agent 體系 (Agent Core) - `interfaces/agent/`

### 5.1 IAgent & Specialized Agents
```typescript
/**
 * 基礎 Agent 接口
 */
export interface IAgent {
  id: string;
  role: string;
  receiveTask(task: any): Promise<void>;
  proposeMutation(mutation: IMutationRequest): Promise<void>;
  
  /** JSON 序列化與初始化 */
  toJSON(): Record<string, any>;
  initFromJSON(config: Record<string, any>): Promise<void>;
}

/**
 * 協調者 Agent (Coordinator)
 */
export interface ICoordinator extends IAgent {
  /** 執行階層式衝突裁決 */
  arbitrateMutations(proposals: IMutationRequest[]): Promise<IMutationRequest[]>;
  /** 生成任務 DAG */
  planTaskGraph(goal: string): Promise<any>;
}

/**
 * 根級 Agent (Root)
 */
export interface IRootAgent extends IAgent {
  createSession(goal: string, config?: any): Promise<string>;
  terminateSession(session_id: string): Promise<void>;
}
```

---

## 6. 基礎設施與管理 (Infrastructure) - `interfaces/infra/`

### 6.1 IAgentRegistry & ISessionManager
```typescript
/**
 * Agent 註冊與動態加載中心
 */
export interface IAgentRegistry {
  register(agent: IAgent): void;
  getAgent(id: string): IAgent | undefined;
  
  /** 從 JSON 動態加載 Agent */
  loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent>;
}

/**
 * 會話生命週期管理器
 */
export interface ISessionManager {
  /** 從 JSON 創建會話 */
  createFromJSON(json: Record<string, any>): Promise<ISession>;
  /** 恢復快照 */
  restoreFromSnapshot(snapshot: string): Promise<ISession>;
}
```

---

## 7. 領域邏輯與工具 (Vertical & Tool) - `interfaces/vertical/` & `interfaces/tool/`

### 7.1 IVerticalSystem & ITool
```typescript
/**
 * 領域邏輯系統接口
 */
export interface IVerticalSystem {
  name: string;
  initialize(session_id: string): Promise<void>;
  getPlanner(): any;
}

/**
 * 原子化工具接口
 */
export interface ITool<TIn = any, TOut = any> {
  name: string;
  description: string;
  /** 通過 Guardian 執行的核心邏輯 */
  run(input: TIn): Promise<TOut>;
  required_capabilities: string[];
}
```

---

## 8. 通訊與裁決 (Comm & Hook) - `interfaces/comm/` & `interfaces/hook/`

### 8.1 IRouter & IMutationValidator
```typescript
/**
 * 全鏈路路由器
 */
export interface IRouter {
  /** 路由訊息並強制傳播 TraceContext */
  route(message: any): Promise<void>;
}

/**
 * 變更校驗器
 */
export interface IMutationValidator {
  /** 靜態與動態版本校驗 */
  validateStatic(request: IMutationRequest): boolean;
  validateVersion(request: IMutationRequest, current_hook: any): boolean;
}
```
