# Task Heartbeat and Timeout Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement periodic heartbeats from agents during execution and timeout monitoring in TaskManager to identify and handle unresponsive tasks.

**Architecture:** Use LangChain callbacks in `BaseAgent` to publish `TASK_HEARTBEAT` events. `TaskManager` subscribes to these events to track the last activity of each task and uses a `PulseEngine` hook to periodically check for tasks that have exceeded their timeout threshold.

**Tech Stack:** TypeScript, LangChain (Callbacks), EventBus, PulseEngine.

---

### Task 1: Implement Heartbeat Emission in BaseAgent

**Files:**
- Modify: `src/agent/BaseAgent.ts`

- [ ] **Step 1: Create a Callback Handler for heartbeats**

Modify `src/agent/BaseAgent.ts` to include a callback handler that emits heartbeats.

```typescript
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { SystemEventType } from '../infra/types/events';

// 在 BaseAgent.ts 中定義或引入
class AgentHeartbeatCallbackHandler extends BaseCallbackHandler {
    name = "AgentHeartbeatCallbackHandler";
    constructor(
        private runtime: any,
        private context: { taskId: string; sessionId: string; agentId: string }
    ) {
        super();
    }

    async handleLLMStart() {
        this.emit();
    }

    async handleToolStart() {
        this.emit();
    }

    private emit() {
        if (!this.runtime || !this.context.taskId) return;
        this.runtime.eventBus.publish({
            type: SystemEventType.TASK_HEARTBEAT,
            userId: 'SYSTEM',
            sessionId: this.context.sessionId,
            payload: {
                taskId: this.context.taskId,
                agentId: this.context.agentId,
                timestamp: Date.now()
            },
            timestamp: Date.now()
        });
    }
}
```

- [ ] **Step 2: Update `BaseAgent.execute` to use the Callback Handler**

```typescript
// 在 BaseAgent.execute 中
async execute(taskGoal: string, context: IAgentExecuteContext): Promise<IAgentExecuteResult> {
    // ... 現有邏輯 ...
    
    const heartbeatHandler = new AgentHeartbeatCallbackHandler(this.runtime, {
        taskId: context.taskId || '',
        sessionId: context.sessionId,
        agentId: this.id
    });

    try {
        const resultState = await this.reactAgent.invoke({
            messages: [
                ...session.getLangChainMessages(),
                { role: 'user', content: `[DIRECTIVE]: 你當前的任務目標是「${taskGoal}」。請直接開始執行並回報結果。` }
            ]
        }, {
            recursionLimit: 50,
            configurable: {
                toolContext: context
            },
            callbacks: [heartbeatHandler] // 注入 Callbacks
        });
        // ...
    }
    // ...
}
```

- [ ] **Step 3: Commit changes**

```bash
git add src/agent/BaseAgent.ts
git commit -m "feat(agent): implement heartbeat emission via LangChain callbacks"
```

---

### Task 2: Implement Heartbeat Tracking in TaskManager

**Files:**
- Modify: `src/manager/TaskManager.ts`

- [ ] **Step 1: Add heartbeat tracking state to TaskManager**

```typescript
// src/manager/TaskManager.ts
export class TaskManager {
    // ... 現有屬性 ...
    private lastHeartbeats = new Map<string, number>(); // taskId -> timestamp
    private readonly TIMEOUT_THRESHOLD = 30000; // 30 秒
    
    constructor(
		private agentManager: AgentManager,
		private repo: ITaskRepository
	) {
		this.planner = new TaskPlanner();
        this.setupHeartbeatListener(); // 初始化監聽
	}

    private setupHeartbeatListener() {
        GlobalRuntime.getInstance().eventBus.subscribe(SystemEventType.TASK_HEARTBEAT, (event) => {
            const { taskId, timestamp } = event.payload;
            if (taskId) {
                this.lastHeartbeats.set(taskId, timestamp);
            }
        });
    }
}
```

- [ ] **Step 2: Update heartbeat on task start and clear on end**

```typescript
// src/manager/TaskManager.ts -> executeNode
private async async executeNode(chainId: string, taskId: string) {
    // ...
    task.updateStatus(TaskStatus.RUNNING);
    this.lastHeartbeats.set(taskId, Date.now()); // 初始化心跳時間
    await this.repo.save(task.toDTO());
    // ...
    try {
        // ...
        chain.graph.completeTask(taskId);
    } catch (err: any) {
        // ...
    } finally {
        this.lastHeartbeats.delete(taskId); // 清理心跳記錄
    }
}
```

- [ ] **Step 3: Commit changes**

```bash
git add src/manager/TaskManager.ts
git commit -m "feat(manager): track task heartbeats in TaskManager"
```

---

### Task 3: Implement Timeout Detection in TaskManager

**Files:**
- Modify: `src/manager/TaskManager.ts`

- [ ] **Step 1: Register Pulse Hook for timeout check**

```typescript
// src/manager/TaskManager.ts -> constructor
// 需要傳入 PulseEngine 或者從 GlobalRuntime 獲取
// 假設我們在 GlobalRuntime 中已經啟動了 PulseEngine

// 在 TaskManager 增加一個初始化方法或者在 constructor 處理
public initTimeoutMonitor(pulseEngine: any) {
    pulseEngine.registerHook({
        id: 'task-timeout-monitor',
        interval: 10, // 每 10 秒檢查一次
        action: () => this.checkTimeouts()
    });
}

private async checkTimeouts() {
    const now = Date.now();
    for (const [taskId, lastPulse] of this.lastHeartbeats.entries()) {
        if (now - lastPulse > this.TIMEOUT_THRESHOLD) {
            recorder.warn(`[TaskManager] Task ${taskId} timed out. Last heartbeat: ${new Date(lastPulse).toISOString()}`, {
                type: LogType.SYSTEM
            });
            await this.handleTimeout(taskId);
        }
    }
}

private async handleTimeout(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    // 標記任務為失敗
    task.fail('Execution timeout: No heartbeat received for 30s');
    await this.repo.save(task.toDTO());
    
    // 找出所屬的 chain 並標記失敗 (TaskManager 目前的邏輯是單個任務失敗則 Chain 失敗)
    for (const [chainId, chain] of this.chains.entries()) {
        if (chain.graph.getTask(taskId)) {
            chain.status = ChainStatus.FAILED;
            break;
        }
    }
    
    this.lastHeartbeats.delete(taskId);
}
```

- [ ] **Step 2: Update GlobalRuntime to initialize the monitor**

Modify `src/runtime/GlobalRuntime.ts` in the `start` method.

```typescript
// src/runtime/GlobalRuntime.ts -> start()
// ...
this.taskManager = new TaskManager(this.agentManager, this.taskRepo);
this.taskManager.initTimeoutMonitor(this.pulseEngine); // 新增這行
// ...
```

- [ ] **Step 3: Commit changes**

```bash
git add src/manager/TaskManager.ts
git commit -m "feat(manager): implement timeout detection via PulseEngine"
```

---

### Task 4: Verification and Testing

**Files:**
- Create: `tests/manager/TaskManagerTimeout.test.ts`

- [ ] **Step 1: Write a test for timeout detection**

```typescript
// 模擬心跳過期的情況，驗證 TaskManager 是否能正確處理
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/manager/TaskManagerTimeout.test.ts`
Expected: PASS

- [ ] **Step 3: Commit tests**

```bash
git add tests/manager/TaskManagerTimeout.test.ts
git commit -m "test(manager): add task timeout detection test"
```
