# SuperNova Project Roadmap

This document outlines the recent core milestones and future development vision of SuperNova (an Agent Runtime based on TS/Bun).

## v0.1.0 - Foundation & Memory System (Completed)

The core infrastructure and the "Graph-Vector Hybrid Memory System" of SuperNova have been completed, laying a solid foundation for subsequent autonomous evolution.

### Technical Highlights
1. **Graph & Episodic Memory System**
   - **Graph Memory**: Automatically extracts atomic Entities and Relations via LLM, combining OpenAI Embeddings and Vectra local vector database for storage.
   - **Episodic Memory**: Through a daily summary mechanism, messy conversations are automatically condensed into an "AI Diary", preserving the interaction atmosphere and user's implicit rules.
   - **Dynamic Context Injection**: Implemented the `BeforeAgentStep` lifecycle Hook to automatically search for highly relevant graph memories and recent diaries, seamlessly injecting them into the agent's brain.
2. **Architecture & Config**
   - **Zod-based Config Engine**: Uses Zod Schemas for strong type validation and dynamic overrides, fully supporting YAML format config generation and reading, providing excellent error-proofing and configuration flexibility.
   - **Two-Tier Workspace Isolation**: Implemented "Persistent" and "Volatile" workspace tiers, ensuring each Session has an isolated experimental sandbox.
   - **Asynchronous EventBus**: Completely abandoned direct Method Calls. All lifecycles and state transitions flow through the EventBus, providing deadlock prevention and high decoupling.
3. **Performance & Reliability**
   - **Compaction Fast-Fail**: Introduced the `isOffloaded` marker to achieve $O(1)$ fast-fail checking during background history compaction, significantly reducing OOM pressure.
   - **LRUCache Infrastructure**: Introduced generic LRUCache and incremental caching mechanisms to eliminate infinite memory growth caused by high-frequency event broadcasting and history retrieval.
   - **History Safety Cap**: Enforced defensive JSONL file read slicing to prevent malicious giant files from paralyzing memory.
4. **Agent & Session State**
   - **Stateless & Projection**: Introduced Projection State at the Session level and upgraded Agents to a stateless execution model, greatly improving concurrency handling and state isolation.
   - **Transparent ReAct Loop**: Fully captures LLM thought processes (Thoughts) and tool execution states, establishing a highly observable interaction foundation (`demo/v0.1.0.ts`).

---

## v0.2.0 - Virtual Embodied AI & Autonomous Evolution (In Progress)

After ensuring the stability of the v0.1.0 infrastructure, we will move towards "Code-based Autonomous Evolution" and "Fine-grained Manipulation":

- **Virtual Embodied AI**
  - Focus on fine-grained manipulation and perception in virtual environments, achieving Code-based self-correction and autonomous evolution capabilities.
- **New CodeSkill System (Agent-Evolvable Code)**
  - Unlike traditional Prompt Skills on the market, CodeSkill is essentially **real code** and is designed to allow Agents to **self-optimize, refactor, or even create new ones from scratch** during execution, perfectly matching "Code-based autonomous evolution."
  - The foundation is strictly categorized into `Obversal` (Observation), `Action`, etc., ensuring that every Skill written by the Agent has its permissions and responsibilities strictly bounded.
  - **Self State Maintenance**: Skills have independent self-state management capabilities, allowing them to add and maintain internal variables during execution.
  - **Automated Metrics**: The system automatically compiles success/error rates, average time spent, and 1% loss equivalence for each tool and Skill at the base layer to monitor performance and robustness.
  - **Hardened Sandbox & WASM**: To address the security risks of Agents autonomously writing uncontrollable code, dynamically generated CodeSkills will be strictly restricted to execute within a virtual sandbox or WebAssembly (WASM) container, completely preventing unauthorized operations and system crashes.

- **Materialized Task System (Completed)**
  - Added the Task system, allowing the main brain and developers to clearly see the execution progress of each step.
  - **Technical Highlights**:
    - **LATS Strategy Search Engine**: Combines MCTS (Monte Carlo Tree Search) and UCB1 algorithm to perform deep and broad strategy search and reflection before generating the DAG, finding the optimal solution path.
    - **Asynchronous Event Scheduling**: `TaskManager` and `StrategizeAndPlanTool` are fully integrated with EventBus, unleashing the Agent's multi-tasking concurrency capabilities through background execution and Event Injection.
    - **Task Dashboard Injection**: Through the `BeforeAgentStep` lifecycle Hook, a dedicated task dashboard (global tree view or personal task list) is dynamically injected based on the Agent's role (Creator vs. Assignee), achieving high contextual awareness.
    - **Orchestration Loop**: Separated the responsibilities of `SpawnAgentTool` and `AssignTaskTool`, combined with `UpdateTaskStatusTool` and `TaskManager`'s background event broadcasting, to achieve a fully automated loop from assignment, execution, reporting to dependency unlocking.

- **Advanced Workspace Collaboration**
  - **Step-level Caching**: Every critical step of a task is forcibly linked with the current Git Workspace system for isolated caching, ensuring a clean rollback and inspection at any time.
  - **Multi-Agent Conflict Resolution**: Lays the foundation for future multi-tasking concurrency, utilizing the advantages of Git tree branches to automatically handle Merge conflicts and state merging when multiple Sub-Agents operate on files simultaneously.

- **Configurable Tool Delegation (Completed)**
  - Tool resources are no longer mindlessly mounted globally. Except for high-risk tools that require strict control, the `MainAgent` can flexibly and accurately "Delegate" specific toolsets to Sub-Agents when creating or waking them up based on task requirements.
  - **Technical Highlights**:
    - Changed ToolRegistry to a stateless object directly managed by AgentManager, no longer relying on global singletons, achieving complete inversion of control of lifecycles.
    - Supports `SpawnAgentTool` to generate disposable agents (`isTemp: true`), which are automatically isolated securely and have their memory released by the system upon task completion.

- **Domain-Driven Refactoring (Completed)**
  - Preventively completed the directory refactoring of Clean Architecture to address the code complexity brought by multi-agents.
  - **Technical Highlights**:
    - Extracted a pure `domain` layer, completely decoupling core interfaces like all IRepository and IEventBus.
    - Flattened the underlying `infra` folders into `llm`, `repositories`, `storage`, `workspace`, solving the original dependency hell up to 5 layers deep.
    - Centrally manage brain config files in `prompts/`, providing a cleaner injection pipeline for Sub-Agents with different responsibilities.
