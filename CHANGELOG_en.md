# SuperNova Changelog

All notable changes, architectural refactoring, and performance optimizations to the SuperNova system will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.2] - 2026-08-11
### Added
- **Multi-Agent EmbodiedEnv Isolation**:
  - **Environment Infrastructure Abstraction (BaseEmbodiedEnv)**: Implemented the `BaseEmbodiedEnv` abstract layer extending `ILifecycle`, shifting environment lifecycle management to the `RuntimeKernel`. Environments (e.g., `MinecraftEnv`) now operate as global singletons.
  - **Dynamic Agent Binding Mechanism**: Agents can dynamically log in or log out of environments using `registerAgent` / `unregisterAgent`. A single environment can simultaneously host agents from multiple distinct sessions or multiple agents within the same session.
  - **Session-level Cache Isolation for Skill Engine**: Refactored the `LRUCache` key generation in `SkillManager` to use a compound key (`${sessionId}:${agentId}:${skillId}`). This ensures absolute physical isolation of skill source code and compilation caches across multi-agent and multi-session scenarios, preventing memory contamination and cache overwrites.
  - **SDK Declaration Decoupling**: Extracted the hardcoded external environment declarations from the application layer into a standalone `SuperNovaBot.d.ts` file dynamically loaded by `BaseEmbodiedEnv`, perfectly adhering to Domain-Driven Design (DDD) Interface Segregation principles.

## [0.2.1] - 2026-08-10
### Added
- **Skill Caching & Lifecycle Management**:
  - Introduced `LRUCache` in the core `SkillManager` to centralize the instantiation and caching of both `ActionSkill` and `ObservationSkill`.
  - Added an `onEvict` hook to gracefully terminate internal sensory loops when background skills (`ObservationSkill`) are evicted from the cache, preventing memory leaks and zombie loops.
- **Self-Healing Cache Invalidation Mechanism**:
  - Ensured that all tools capable of mutating skill source code (`create_code_skill`, `delete_code_skill`, `rollback_code_skill`) now synchronously trigger `SkillManager`'s `invalidateCache`. This completely resolves the infinite self-healing loop vulnerability where the system would execute obsolete code after an update.
- **Underworld Migration (Minecraft)**:
  - Completely removed the legacy `CommandRouter` and old command tools. The Minecraft environment has fully migrated to the generic `CodeSkill` architecture (e.g., `MoveSkill`, `ObserveSkill`, `ChatSkill`), achieving infrastructure consistency and dynamic extensibility.

## [0.2.0] - 2026-08-09
### Added
- **Embodied Agent Self-Evolving CodeSkill Ecosystem**:
  - **CodeSkill Versioning & Rollback**: Introduced an indirection storage mechanism. Skill scripts are saved with dynamic version tags like `skillver_xxx` instead of direct overwriting. When a new code version fails during `execute_code_skill`, the system records its loss rate and provides a `rollback_code_skill` tool, enabling the Agent to revert to the most stable historical version with the highest success rate.
  - **Read & Manage CodeSkills**: Added `read_code_skill`, `list_skill_versions`, and `delete_code_skill` tools, allowing the Agent to freely read old source codes, list historical performance metrics, or delete unused skills to save System Prompt Tokens. This completes the automated "perceive-create-debug-rollback" self-healing loop.
  - **Generic Env SDK**: Extracted the Minecraft-specific `IBotContext` from the core module. `EmbodiedAgent` now receives external TS interface declarations via `AgentOptions.envSdkDeclaration` and uses the `<TEnv>` generic to connect to environments. This realizes true Domain-Driven Design (DDD) decoupling, making it easy for the Agent to adapt to any external environment (e.g., Line Bot, web crawlers, etc.).
  - **Default Tool Registration**: Expanded `AgentManager`'s `getDefaultTools` to automatically mount the full suite of CodeSkill management tools when generating an Embodied type agent.
- **Multi-Agent Task & TaskDAG System**:
  - **Task Dashboard Injection**: Through the `BeforeAgentStep` Hook interceptor, the system automatically and dynamically injects a task dashboard into the System Prompt before every Agent thinks. It shows the global DAG tree to task creators and only the exclusive target to assignees, completely decoupling the binding relationship between the Agent and a single task.
  - **Dispatch & Report Loop**: Refactored `SpawnAgentTool`, separating the assignment logic into a brand new `AssignTaskTool`, and implemented `UpdateTaskStatusTool` to allow Agents to automatically report upon completion based on the ID bound to them. Coupled with `TaskManager`'s automatic event broadcasting, this completes a fully automated loop from assignment, execution to downstream task unlocking.
  - **LATS Strategy Planning Engine (Language Agent Tree Search)**: Implemented a strategy planning engine based on MCTS (Monte Carlo Tree Search) and UCB1 algorithm. When facing complex tasks, the Agent will first self-deduce, score, and reflect at the natural language level to search for the best solution trajectory, preventing it from getting stuck in local optima.
  - **TaskDAG Dependency Graph Translation**: The text strategy generated by LATS is seamlessly translated by the LLM into precise Task JSONs and managed by the background `TaskManager`, supporting dependency unlocking and error-proofing.
  - **Async + Event-driven Tools**: `StrategizeAndPlanTool` has been officially rewritten as an asynchronous background task. After tool invocation, the Agent's state is immediately released. Once the task is completed, it forcefully injects a `BACKGROUND_TASK_COMPLETED` message via EventBus, completely liberating the Agent's computing performance and multitasking capabilities.
- **Multi-Agent Dynamic Delegation System**:
  - **Anti-Air-Talking Mechanism**: Enhanced `SendMessageTool`. When sending cross-agent messages, the system automatically appends a strong prompt at the end to teach the receiver how to correctly use the tool to reply, completely solving the LLM's "Air-Talking" pain point.
  - **ToolRegistry Decoupling & Inversion of Control**: Extracted `ToolRegistry` from the global DI container to be a stateless manager directly administered by `AgentManager`, completely solving circular dependencies between modules.
  - **SpawnAgentTool & Autonomous Lifecycle Management**: The `MainAgent` now has the capability to directly spawn task-oriented sub-agents (`TaskAgent`), dynamically assigning targets (Objective), workspace isolation levels (WorkspaceType), and tool permissions (AllowedTools); furthermore, sub-agents set to `isTemp: true` will automatically be destroyed by the system to release resources after completing all tasks and calling `UpdateTaskStatusTool`.
  - **Configurable Tool Delegation**: Through the new ToolRegistry architecture, the system can dynamically filter out the specific tools allowed for an Agent when waking up or generating it, achieving strict permission boundaries.

### Changed
- **Centralized Prompt and Schema Management**:
  - Migrated all System Prompts and Zod Structured Output Schemas scattered across various modules to the `src/core/prompts/` directory (e.g., `task.prompt.ts`) and loaded them via a unified pipeline, realizing a complete decoupling of algorithm logic and prompts.
- **Clean Architecture & DDD Refactoring**:
  - Completely separated the four core directories: `domain`, `infra`, `tools`, and `prompts`. Extracted the abstract interface layer to `domain`, and flattened implementations heavily dependent on the outside world to `infra/repositories` and `infra/storage`.
  - Extracted the tool system from the Agent module to a dedicated `tools/` directory, laying a solid foundation for future Agent-Evolvable CodeSkill dynamic mounting and sandbox systems.

### Fixed
- **Multi-Agent Workspace Driver Resolution Conflict**:
  - Fixed a critical defect where multiple agents under the same Session couldn't bind to different driver types (e.g., `GitLocalStorageDriver` vs `MemoryVfsStorageDriver`) separately when accessing `WorkspaceManager`. Corrected the underlying cache key from `sessionId` to `agentId`, fully realizing agent-level workspace instance isolation.

---

## [0.1.0] - 2026-08-07

### Added
- **Graph & Episodic Memory System**:
  - **Graph Memory**: The system can automatically extract conversations into atomic Entities and Relations in the background, and store them using OpenAI Embeddings in a vector database.
  - **Episodic Memory**: Features a daily summary function that automatically condenses lengthy conversation history into an "AI Private Diary" to preserve the context and user's implicit rules.
  - **Dynamic Context Retrieval & Injection**: The system possesses a "recall" capability. Before the Agent executes each step, it automatically searches for related graph memories via Cosine Similarity based on the current context, and seamlessly injects them along with recent diaries into the brain (System Prompt).
- **Workspace Isolation**:
  - Implemented Git Worktree workspace isolation to ensure independent file states for sessions. This also lays a solid foundation for handling Git conflicts and state merging during Multi-Agent collaboration in the future.
- **History & Cache**:
  - Added Sliding Window history compaction functionality, along with a generic LRUCache.
- **Demo Applications**:
  - Created `demo/v0.1.0.ts` to showcase an interactive CLI ReAct execution loop via asynchronous EventBus messaging.
- **History Safety Cap**:
  - Added a `max_history_lines_safety_cap` protection mechanism in `FileSystemDataBlockRepository`. When reading extremely large JSONL files from the underlying storage, it enforces a slice before the time-consuming JSON deserialization, ensuring the system and memory will absolutely not be blown up by malicious or abnormal large history files.
- **Compaction Fast-Fail Mechanism**:
  - Added the `isOffloaded` persistent marker to `DataBlock` and its serialization interface, allowing `SessionManager` to perform O(1) fast-fail checks during background history compaction, completely eliminating redundant string scanning for already compressed blocks, greatly reducing OOM pressure.
- **Memory Cache Infrastructure (LRUCache)**:
  - Implemented a dedicated `LRUCache` utility class to provide a safe caching mechanism with a capacity limit for high-frequency access in the system, preventing infinite memory growth (`d4616a1`, `fc9d249`).
- **Session & Agent State Management**:
  - Introduced Projection State and a strictly controlled Inbox queue mechanism at the Session layer, strengthening state isolation and concurrency control (`af6d3d4`).
  - Refactored the Agent execution model to "Stateless Execution" and implemented a React-pattern-based Agent cache and `ProjectionHandler`, significantly improving concurrency processing capabilities (`3603fb8`).
- **Transparent ReAct Loop**:
  - Supports completely capturing and passing the LLM's internal thought processes (Thoughts) and tool execution states (Tool Blocks) in array format, drastically improving observability during asynchronous calls (`2bbb34d`, `cac7a25`).
- **Config Management Migration**:
  - Added `event_bus_lru_size` to `Config.ts` and `DefaultConfig.ts`, allowing external configuration of the EventBus listener cache limit (`f949420`).

### Changed
- **Config Engine Revamp**:
  - Revamped the configuration engine, using Zod for dynamic Schema traversal, and fully switched to YAML format for generating and reading config files, drastically improving developer readability and maintainability.
- **Memory Pipeline**:
  - Simplified the background memory pipeline to a single-stage Graph Memory extraction.
- **History Batch I/O Pipelining**:
  - Upgraded `FileSystemDataBlockRepository` and `IRepository` to support array input and single file append writing (Single I/O).
  - Refactored `SessionManager.handleAgentMessage` to group high-frequency arriving messages by Agent and write them in batches, completely resolving the N+1 I/O blocking bottleneck caused during large-volume broadcasting.
- **Config Management Migration**:
  - Officially extracted the hardcoded thresholds (Magic Numbers) regarding Payload offloading in `SessionManager`, adding `offload_threshold_new_message` and `offload_threshold_compact` to `Config.ts`, and uniformly renamed variables to `thresholdLength` to reflect their actual character-counting behavior.
  - Implemented Defensive Config Fallback in `FileSystemDataBlockRepository`. All `this.config` calls are supplemented with optional chaining (`?.`) combined with `DEFAULT_CONFIG` as a fallback, achieving zero hardcoding and absolute crash prevention capability in the underlying repository.
- **Agent Module Optimization (BaseAgent & ProjectionHandler)**:
  - Replaced the string concatenation (`+=`) in `buildProfilePromptSections` with an efficient array `join` to reduce the garbage collection burden on the V8 engine (`9acad0a`).
  - Introduced `WeakMap` caching for `generateToolsSignature` and `profileHash`, blocking extremely CPU-consuming repetitive hash calculations (`9acad0a`).
  - Rewrote the tool-finding algorithm in `callModel` from an `O(N²)` nested loop to an `O(N)` Map lookup (`9acad0a`).
  - Upgraded the history merging algorithm of `ProjectionHandler.getMergedHistory` from an `O(N log N)` `concat+sort` to an `O(N)` Two Pointers Merge (`6e049c7`).
  - Optimized Agent concurrency handling and Pipelining mechanisms, and implemented Zombie Listener cleanup mechanisms and Temporal Context Injection (`45de2a5`).
- **Messaging & EventBus Optimization**:
  - In `DataBlock`'s size validation (`validateSize`), abandoned the time-consuming `Buffer.byteLength` calculation in favor of an `O(1)` string `.length` check, alleviating Event Loop blocking (`0a6f4fc`).
  - Implemented DataBlock incremental caching, and changed the arrays and `Set`s created during EventBus event dispatching to use `LRUCache` for event listener caching, completely eradicating GC pressure during high-frequency broadcasting (`f949420`, `b930c64`).
  - Comprehensively refactored `AgentMessage` and underlying components to support passing events as Array Payloads, optimizing `SessionManager.handleAgentMessage` to process data blocks in batches and lower I/O call frequency (`cac7a25`, `a97e4c1`).
- **Infrastructure & Utils Optimization**:
  - Implemented automatic Offloading and storage mechanisms for large Payloads in `FileSystemDataBlockRepository`, ensuring main memory doesn't overflow from giant messages (`d4616a1`).
  - Replaced the high-frequency `crypto.randomBytes` calls in `IdGenerator` with lightweight `Math.random` 8-character Hex generation, reducing CPU load (`9292761`).
  - Added a TTL (Time-To-Live) caching mechanism to `PromptLoader`, and optimized Console output and `FileTransport` log writing with asynchronous and delayed compaction (`c02655d`, `2906556`).
- **Documentation & Testing Updates**:
  - Updated integration tests for the stateless concurrent architecture and cleaned up outdated test examples (`0282b35`).
  - Synchronously updated architecture blueprints (`ARCH.md`, `agent.md`, `memory.md`) and `README.md` to reflect the latest performance optimizations, LRUCache infrastructure, and ReAct loop transparency mechanisms (`80bd4d1`, `d4616a1`).

### Fixed
- **Session Load Race Condition**:
  - Completely refactored the underlying logic of `SessionManager` for listening to high-frequency events (`handleAgentMessage`, `handleProjectionToggled`), ripping out redundant asynchronous disk retrievals (`loadSession`), and fully adopting a Fail-Fast strategy, completely eradicating session load races and mutual overriding issues under high concurrency.
- **Agent Initialization State Leak**:
  - Fixed the risk of half-finished products being exposed in `AgentManager.spawnAgent`. Delayed `addAgentToPool` until all I/O blocking operations such as workspace mounting and tool binding are fully completed and the state switches to Ready, guaranteeing the absolute integrity of Agents in the active pool.
- **Graceful Shutdown Idempotency**:
  - Introduced the `isShuttingDown` flag lock in `RuntimeKernel`. When subjected to continuous OS interrupt signals (e.g., triggering `Ctrl+C` or `SIGINT` consecutively), it effectively prevents the shutdown process from being triggered repeatedly, ensuring safe system unmounting (`ee25ece`).
- **Cache Consistency & Concurrency Race Defense**:
  - Fixed the issue where caches could be mutually polluted when `ProjectionHandler.resume` utilized `Promise.all` for high-concurrency history restoration. Adopted an Eager Cache Invalidation strategy to guarantee absolute sequence in database writing while enjoying full-speed concurrency (`6e049c7`).
