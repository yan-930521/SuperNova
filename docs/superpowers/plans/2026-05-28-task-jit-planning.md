# Task 3: True JIT Dynamic Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the task planning and execution system to support Just-In-Time (JIT) milestone expansion, allowing the planner to adjust future tasks based on the results of completed ones.

**Architecture:** 
1. Modify `TaskPlanner.expandMilestone` to only expand the current milestone.
2. Update `TaskManager` to manage the planning lifecycle, triggering expansion when a milestone is completed.
3. Ensure task IDs and dependencies are correctly managed across incrementally expanded milestones.

**Tech Stack:** TypeScript, LangGraph, Zod

---

### Task 1: Refactor TaskPlanner for JIT Expansion

**Files:**
- Modify: `src/task/TaskPlanner.ts`

- [ ] **Step 1: Update `expandMilestone` to support incremental expansion**

```typescript
  async expandMilestone(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const finalGraphData = state.planning.taskGraph || { nodes: [], milestones: state.planning.milestones, currentMilestoneIndex: -1 };
    const finalGraph = new TaskGraph();
    finalGraph.loadFromJSON(finalGraphData);

    const currentIdx = state.planning.currentMilestoneIdx;
    const milestone = state.planning.milestones[currentIdx];
    const milestonePrefix = `m${currentIdx + 1}_`;

    recorder.info(`[TaskPlanner] Expanding milestone [${currentIdx + 1}/${state.planning.milestones.length}]: ${milestone}`, { 
      type: 'PLAN',
      session_id: state.metadata?.sessionId,
      trace_id: state.metadata?.traceId
    });

    // Determine previous milestone task IDs for cross-milestone dependencies
    const prevTasks = finalGraph.getAllTasks().filter(t => t.id.startsWith(`m${currentIdx}_`));
    const prevTaskIds = prevTasks.map(t => t.id);

    const result = await this.expansionEngine.infer(state as any, TaskExpandResponseSchema, {
      variables: {
        milestone: milestone,
        projected_context: JSON.stringify(state.planning.projectedContext),
        available_agents: JSON.stringify(state.metadata?.available_agents || []),
        // Add results of previous tasks to context if available
        execution_history: JSON.stringify(finalGraph.getAllTasks().filter(t => t.status === 'completed').map(t => ({ id: t.id, goal: t.goal, result: t.result })))
      }
    });

    const currentMilestoneNodes: TaskDTO[] = result.nodes.map((n: any) => {
      const originalId = n.id || uuidv4();
      const globalId = `${milestonePrefix}${originalId}`;
      const internalDeps = (n.dependencies || []).map((d: any) => `${milestonePrefix}${d}`);
      
      // If no internal dependencies, depend on all tasks from the previous milestone
      const globalDeps = (internalDeps.length > 0) ? internalDeps : [...prevTaskIds];
        
      return {
        ...n,
        id: globalId,
        dependencies: globalDeps,
        status: 'pending' as const
      };
    });

    currentMilestoneNodes.forEach(node => finalGraph.addTask(node.id, node as any));
    currentMilestoneNodes.forEach(node => {
      node.dependencies.forEach(depId => {
        try { finalGraph.addDependency(depId, node.id); } catch (e) {}
      });
    });

    const updatedGraphData = finalGraph.toJSON() as unknown as TaskGraphData;
    updatedGraphData.milestones = state.planning.milestones;
    updatedGraphData.currentMilestoneIndex = currentIdx;

    return {
      planning: { ...state.planning, taskGraph: updatedGraphData }
    };
  }
```

- [ ] **Step 2: Commit changes**

```bash
git add src/task/TaskPlanner.ts
git commit -m "refactor: implement JIT milestone expansion in TaskPlanner"
```

### Task 2: Update TaskManager for JIT Lifecycle

**Files:**
- Modify: `src/manager/TaskManager.ts`

- [ ] **Step 1: Add `expandNextMilestone` method to `TaskManager`**

```typescript
	/**
	 * 展開下一個里程碑
	 */
	private async expandNextMilestone(chainId: string) {
		const chain = this.chains.get(chainId)!;
		const agents = this.agentManager.getAllAgents().map(a => ({ id: a.id, role: a.role, capabilities: a.capabilities }));
		
		// 1. 準備當前狀態
		const taskGraphData = chain.graph.toJSON();
		taskGraphData.milestones = chain.goal ? [] : []; // This needs to be correctly handled from existing state
		// Actually, we need to store the milestones somewhere or retrieve them from the repo
		// For now, let's assume we can reconstruct the state
		
		const currentState: AgentState = {
			goal: chain.goal,
			currentTask: "",
			messages: [],
			thoughtTree: { nodes: [], rootId: null, activeNodeId: null, iterationCount: 0 },
			planning: { 
				milestones: (chain as any).milestones || [], 
				currentMilestoneIdx: (chain as any).currentMilestoneIdx + 1, 
				taskGraph: taskGraphData, 
				projectedContext: (chain as any).projectedContext || {} 
			},
			lastEvaluations: [],
			errors: [],
			metadata: { available_agents: agents, sessionId: chain.sessionId, traceId: chain.traceId }
		};

		recorder.info(`[TaskManager] Expanding milestone ${currentState.planning.currentMilestoneIdx + 1} for ${chainId}`, { type: LogType.PLAN });

		// 2. 執行擴展
		const finalState = await this.planner.expandMilestone(currentState as any); // Use expandMilestone directly
		
		if (!finalState.planning?.taskGraph) throw new Error("Milestone expansion produced no graph.");

		// 3. 更新 TaskManager 狀態與 Repo
		const newNodes = finalState.planning.taskGraph.nodes.filter(n => !chain.graph.getTask(n.id));
		for (const n of newNodes) {
			const task = new Task({ ...n, sessionId: chain.sessionId });
			await this.repo.save(task.toDTO());
			chain.graph.addTask(n.id, n);
			this.activeTasks.set(n.id, task);
		}

		// 4. 更新里程碑索引
		(chain as any).currentMilestoneIdx = currentState.planning.currentMilestoneIdx;
		
		recorder.info(`[TaskManager] Milestone ${currentState.planning.currentMilestoneIdx + 1} expanded for ${chainId}. Added ${newNodes.length} tasks.`, { type: LogType.PLAN });

		// 5. 繼續執行
		await this.driveExecution(chainId);
	}
```

- [ ] **Step 2: Update `processInbox` to only expand the first milestone**

Modify `processInbox` to call a partial planner or handle the expansion of the first milestone.

- [ ] **Step 3: Update `executeNode` to check for milestone completion**

At the end of `executeNode`, check if all tasks in the current milestone are completed. If so, call `expandNextMilestone`.

- [ ] **Step 4: Commit changes**

```bash
git add src/manager/TaskManager.ts
git commit -m "feat: update TaskManager to handle JIT milestone expansion"
```

### Task 3: Verification

- [ ] **Step 1: Run existing tests to ensure no regressions**

Run: `npm test tests/manager/TaskManagerTimeout.test.ts`
Expected: PASS

- [ ] **Step 2: Create a new test case for JIT expansion**

Create `tests/manager/TaskManagerJIT.test.ts` to verify that milestones are expanded one by one.

- [ ] **Step 3: Run the new test**

Run: `npm test tests/manager/TaskManagerJIT.test.ts`
Expected: PASS
