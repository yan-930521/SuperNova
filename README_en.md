# SuperNova

[English](README_en.md) | [繁體中文](README.md)

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#technical-highlights)
[![Stage](https://img.shields.io/badge/Stage-v0.2.1-green.svg)](#development-roadmap)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

SuperNova is an **Agent Runtime** focusing on performance and state management. Running on the high-performance Bun environment, it leverages an event-driven architecture to effectively solve common issues in long-running AI systems, such as context explosion and goal drift. This enables Agents to maintain stable cognition and execution capabilities during complex, cross-domain long-term tasks.

> **Quick Navigation**: 
> - **Architecture Blueprint**: [docs/ARCH.md](docs/ARCH.md)
> - **Future Roadmap**: [ROADMAP_en.md](ROADMAP_en.md) (Deep dive into the v0.2.1 autonomous evolution roadmap)
> - **Changelog**: [CHANGELOG_en.md](CHANGELOG_en.md)
> - **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)
>
> **Project Predecessor**: [Proj.Nova](https://github.com/yan-930521/Proj.Nova/)

> [!WARNING]
> **Security Warning**
> As this project is currently in a phase of rapid iteration and underlying architecture refactoring, some execution environment tools (e.g., `RunBashTool` which allows Agents to execute native shell commands) **have not yet implemented complete sandboxing or strict command filtering protection**. This means the system currently has potential command injection risks.
> 
> **Strongly Recommended:**
> 1. Run this system **ONLY within isolated Virtual Machines (VMs) or Docker containers**.
> 2. Absolutely DO NOT deploy this system directly on production servers containing sensitive data or important environment variables.

> [!NOTE]
> **About Code Comments & Language**
> As this project originally started as an experimental build in Taiwan, the inline code comments are written in Traditional Chinese. However, the system architecture, variables, function names, and typings are strictly maintained in English. We've provided comprehensive English documentations (`README_en.md`, `ROADMAP_en.md`) to help you grasp the core concepts easily without language barriers.

---

## Prerequisites

- [Bun](https://bun.sh/) >= 1.3.14
- [Git](https://git-scm.com/) >= 2.x
- OpenAI API Key (used for LLM inference and Embedding vectorization)

---

## Quick Start

```bash
# Install dependencies
bun install

# Configure environment variables
cp .env.template .env
# Edit .env and fill in your OpenAI API Key

# Run the main Demo
bun run demo

# Type checking and linting
bun run lint
bun test

# Task System Tests & Demos (Task & DAG)
bun run test:task_lats  # View LATS strategy planning & TaskDAG generation
bun run test:task       # View multi-agent task assignment & automated report loop

# Memory System Tests
bun run test:memory     # View graph memory and episodic memory in action

# Run performance benchmarks
bun run bench:core      # Test LRUCache and EventBus throughput
bun run bench:oom       # Test writing 100k history records and OOM defense
```

> **More Configuration**:
> - For system configuration, please refer to `config.yaml` in the root directory.

---

## Project Structure

```text
SuperNova/
├── src/
│   ├── core/        # Core Engine: EventBus, Agent, Memory, Session, etc.
│   └── package/     # Domain Extensions: Minecraft integration and other applications
├── demo/            # Demo programs and performance benchmark scripts
├── docs/            # Architecture design documents (ARCH.md as the entry point)
├── web/             # Web frontend interface
├── scripts/         # Helper scripts
├── config.yaml      # System configuration file
└── .env.template    # Environment variables template
```

> **Architecture Boundary**: Modules in `src/core/` are uniformly exported via `src/core/index.ts`. `src/package/` must reference core modules through this entry point; deep coupling is strictly prohibited.

---

## Technical Highlights

This project focuses on solving memory exhaustion, token explosion, and state management problems common in long-running Agentic Systems, implemented through the following specific engineering techniques:

### 1. Core State & Scheduling
- **Separation of Decision and Execution Loops**: Split the Agent into `MainAgent` (Decision Hub), `TaskAgent` (Task Execution), and `EmbodiedAgent` (Embodied Perception) to prevent underlying code and physical operation details from polluting the global prompt.

- **Dynamic Context Projection**: The `MainAgent` can seamlessly take over sub-agents (e.g., `EmbodiedAgent`) when necessary. The system dynamically projects the independent history and exclusive toolset of the sub-agent to the main brain, allowing it to directly operate sub-tools to complete specific high-difficulty tasks.

- **EventBus-based Asynchronous Wakeup**: After an Agent calls a tool, it actively `suspend`s. Once the tool finishes execution, the event stream triggers a `resume`, ensuring completely non-blocking wait times.

- **State Persistence (Dehydrate / Rehydrate)**: When an Agent is idle, the system serializes variables including history and token consumption to disk (JSONL), and deserializes them to restore state when needed.

### 2. Memory & Context Optimization
- **Payload Offloading**: When the system detects that a single input exceeds the character threshold, it automatically writes the content to a physical Blob file and replaces it in the Prompt with a short `DataPointer` string, avoiding exhausting the Token limit.

- **Graph & Episodic Memory**:
  - **Graph Memory**: When unprocessed messages reach a set threshold, a background LLM is triggered to translate the conversation into atomic entities and relations, which are then converted into vectors using OpenAI Embeddings and stored.<br/>Before the Agent thinks, the system automatically retrieves related graph memories via Cosine Similarity and seamlessly injects them into the Prompt, achieving context awareness.
  - **Episodic Memory**: Utilizes a heartbeat engine to dynamically track the end of the day. When the user is idle, a background LLM is triggered to condense a day's messy conversation into an "AI Private Diary".<br/>The system will automatically load recent diaries in subsequent conversations to retain the interaction atmosphere and user preferences.

- **History Compaction**: To resolve long-text latency, the system adopts a sliding window mechanism. Old conversation records falling out of the window are subjected to high-intensity Offloading compression and saved to disk, combined with an O(1) check marker to rapidly skip already compressed blocks.

### 3. Infrastructure
- **Clean Architecture & DDD**: Extracted abstract interfaces completely to the `domain` layer for decoupling, and sub-divided the underlying implementation into independent modules like `infra/repositories`, `infra/storage`, and `infra/llm`. Combined with a centralized `prompts/` pipeline, this lays a solid foundation for the system's long-term evolution and multi-agent expansion.

- **Zod-based Config Engine**: The entire system uses Zod Schemas for strong-typed configuration definitions, supporting real-time dynamic overrides and generating YAML format configuration files (with comments), ensuring error-proofing during module startup.

- **Git Worktree Workspace Isolation**: A separate Git Worktree is created for every Session. Any file read/write and tool operations by the Agent are restricted to a dedicated branch directory.<br/>This not only ensures operations are traceable and can be rolled back via `git checkout`, but also perfectly supports Git Merge conflict resolution and state merging during future multi-agent concurrent collaboration.

- **Full Async Concurrency**: The project heavily utilizes concurrent operations to handle high I/O tasks (e.g., writing multiple Session logs in parallel, batch offline memory compression, parallel calls to external LLM APIs), fully leveraging the Event Loop's concurrency capabilities to ensure AI agents are never slowed down by I/O blocking when processing massive contexts.

- **Generic LRU Cache & Memoization**: Implemented an independent and reusable generic `LRUCache` at the base layer, coupled with incremental caching mechanisms to prevent infinite memory expansion and significantly eliminate redundant serialization overhead.

### 4. Multi-Agent Delegation
- **Task Dashboard Injection**: Through the `BeforeAgentStep` Hook, the system dynamically injects a task dashboard into the System Prompt before every Agent thinks. It shows the global DAG tree view to task creators and only exclusive targets to assigned sub-agents, completely decoupling the binding relationship between an Agent and a single task, supporting multi-task delegation.

- **Orchestration Loop**: Separated the responsibilities of `SpawnAgentTool` and `AssignTaskTool`, combined with `UpdateTaskStatusTool` to allow Agents to automatically report upon completion. Paired with `TaskManager`'s automatic event broadcasting, this completes a fully automated loop from assignment and execution to dependency unlocking.

- **Async Task & TaskDAG**: Implemented `StrategizeAndPlanTool` as an asynchronous background task.<br/>The MainAgent can immediately release resources to process other messages after calling the tool. Once background generation is complete, the `EventBus` forcefully injects an event to report task progress, achieving full asynchronous concurrency.

- **LATS Strategy Planning Engine**: Before decomposing a task into a TaskDAG, the engine automatically uses MCTS (Monte Carlo Tree Search) and UCB1 algorithms to perform deep self-deduction, scoring, and reflection on the target to search for the optimal solution trajectory, preventing the Agent from falling into local optima.

- **Configurable Tool Delegation**: When waking up or generating an Agent, the system can dynamically filter out the specific tools the agent is allowed to use, strictly drawing permission boundaries.

- **Autonomous Sub-Agent Lifecycle**: The `MainAgent` can create temporary `TaskAgent`s at any time, assigning targets, workspaces, and specific tools. Upon completing tasks, these temporary sub-agents will automatically have their state reclaimed by the system via `UpdateTaskStatusTool`, releasing system resources.

- **Agent-level Workspace Driver Instances**: When handling workspace I/O, the underlying layer uses the `agentId` to map to independent storage drivers (like purely memory VOLATILE or Git PERSISTENT), meaning even under the same Session, different sub-agents can possess their own isolated spaces.

### 5. Virtual Embodied AI & Evolvable Code
- **Generic Env SDK**: Completely decouple the specific environment (e.g., Minecraft) context. The system uses TS generics and dynamic declaration injection, enabling the Agent to seamlessly adapt to Line Bot, web crawlers, or any external domains.

- **Self-Evolving CodeSkill Ecosystem**: Allows the Agent to dynamically write "physical TypeScript code" as skills during runtime, possessing self-state and self-optimization capabilities.
  - **Versioning and Metrics Control**: The underlying system automatically generates version IDs (`skillver_xxx`) and calculates the success rate and loss rate for each version of a tool.
  - **Auto-Rollback**: When the Agent detects an error in the new code, it can proactively call the rollback tool to seamlessly revert to the most stable historical version with the highest success rate, achieving a fully automated "create-test-debug-fix" self-healing loop.

---

## Development Roadmap

| Version | Stage | Overview |
|:---|:---|:---|
| **v0.1.0** | Completed | Laid a robust foundation for asynchronous EventBus, dynamic graph memory, and sliding window isolation |
| **v0.2.1** | Completed | Introduce Virtual Embodied AI, task scheduling, and Evolvable CodeSkill System |

> For detailed plans, please refer to [ROADMAP_en.md](ROADMAP_en.md).

---

## Performance Benchmark

SuperNova uses built-in `mitata` for extreme stress testing. The following performance on a general consumer-grade environment (12th Gen i5 / Windows 11 / Bun 1.3.14) proves the I/O throughput capabilities of the core infrastructure when facing massive contexts and high-frequency events:

```text
benchmark                                        avg (min … max) p75 / p99    (min … top 1%)
---------------------------------------------------------------- -------------------------------
LRUCache: Set & Evict (Triggering eviction logic) 102.27 µs/iter  71.40 µs █                    
                                           (28.60 µs … 13.30 ms) 697.30 µs █                    
                                         (  0.00  b … 264.00 kb)  11.45 kb ██▄▃▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁

LRUCache: Get (Hit)                               436.79 ns/iter 362.48 ns  █                   
                                           (273.46 ns … 2.38 µs)   1.39 µs ▄█                   
                                         (  0.00  b … 485.00  b)  14.71  b ██▆▃▁▁▁▁▁▁▁▂▂▁▁▂▂▂▂▁▂

EventBus: High-frequency Publish                  784.82 ns/iter 782.74 ns  █                   
                                           (588.79 ns … 5.44 µs)   2.45 µs ▆█▄                  
                                         ( 96.00  b …   1.94 kb) 449.52  b ███▅▄▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
```
> **Data Interpretation**:
> - **Memory Cache Hit (LRUCache Hit)**: Each hit takes less than 1 microsecond, with a throughput of up to **2.28 million ops/sec**.
> - **Core Event Dispatch (EventBus Publish)**: Full asynchronous broadcasting takes under 1 microsecond, with a throughput of approximately **1.27 million ops/sec**, completely eradicating I/O bottleneck issues during multi-agent collaboration.
> - **Defensive OOM Test (Writing 100k Records)**: When instantly flooded with 500 MB (100,000 records) of massive history dialogue, the system only took **2.1 seconds** to complete writing, and successfully maintained memory usage at a stable ~300MB through sliding windows and garbage collection, **effectively preventing OOM crashes**.

---

## Design Decisions

### Why Bun?

| Consideration | Reason for Selection |
|------|---------| 
| Startup & Execution Efficiency | Bun's cold start speed and runtime performance far exceed traditional Node.js, making it suitable for high-frequency, long-running Agents |
| Native TypeScript | Executes `.ts` files directly without an extra compilation step |
| Testing Framework | Built-in high-efficiency `bun test` runner |
| Dependency Management | Extremely fast package installation and a streamlined lockfile mechanism |

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first to understand the development guidelines and submission process.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.
