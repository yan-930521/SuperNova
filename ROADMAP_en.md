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

## v0.2.0 - Virtual Embodied AI & Autonomous Evolution (Completed)

After ensuring the stability of the v0.1.0 infrastructure, we have moved towards "Code-based Autonomous Evolution" and "Fine-grained Manipulation", completing the core implementation:

- **Virtual Embodied AI (Completed)**
  - Focus on fine-grained manipulation and perception in virtual environments, achieving Code-based self-correction and autonomous evolution capabilities.
  - **Multi-Agent Environment Abstraction**: Introduced the `BaseEmbodiedEnv` abstraction, elevating virtual environments (e.g., MinecraftEnv) to system-level singletons managed by `RuntimeKernel`. Fully supports multi-agent and multi-session concurrent logins, creating a true multi-agent coexisting universe.
  - **Session-level Execution Isolation**: `SkillManager` implements a compound key mechanism (`${sessionId}:${agentId}:${skillId}`) to guarantee physical cache isolation, preventing script contamination across parallel universes in a shared environment.
  - **Generic Env SDK**: Completely decoupled Minecraft-specific dependencies. Extracted SDK declarations to a standalone `SuperNovaBot.d.ts` for dynamic injection, and utilized generics (`<TEnv>`) to connect with environments, enabling seamless adaptation to Line Bots, web crawlers, or any domain.

- **New CodeSkill Self-Evolving Ecosystem (Agent-Evolvable Code) (Completed)**
  - Unlike traditional Prompt Skills on the market, CodeSkill is essentially **real code** and is designed to allow Agents to **self-optimize, refactor, or even create new ones from scratch** during execution.
  - The foundation is strictly categorized into `Observation`, `Action`, etc., ensuring that every Skill written by the Agent has bounded responsibilities.
  - **Technical Highlights**:
    - **Dynamic Versioning & Indirection Storage**: Implemented an indirection storage mechanism where the underlying `IdGenerator` automatically generates a `skillver_xxx` suffix for physical files, preventing new code from directly overwriting and destroying older versions.
    - **Skill Caching & Lifecycle Management**: Introduced `LRUCache` in the core `SkillManager` to centralize the management of both `ActionSkill` and `ObservationSkill` instances. Added an `onEvict` hook to ensure evicted background skills can gracefully terminate internal loops.
    - **Self-Healing & Auto-Rollback**: When a new skill fails, the Agent not only records the loss rate but can also use `rollback_code_skill` to revert to a stable version. An automatic cache invalidation mechanism (`invalidateCache`) is integrated into all script-mutating tools, completely resolving the infinite self-healing loop vulnerability.
    - **Metrics & Read-only Maintenance**: Built-in tools like `read_code_skill`, `list_skill_versions`, and `delete_code_skill` allow the Agent to proactively read old source code, view historical success rates, and clean up redundant skills to save Tokens.
    - **Hardened Sandbox & WASM**: To address security risks, future plans include enforcing dynamically generated CodeSkills to execute within a WebAssembly (WASM) container.
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
