# SuperNova

[English](README_en.md) | [繁體中文](README.md)

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Composable_Organs-orange.svg)](docs/ARCH.md)
[![Stage](https://img.shields.io/badge/Stage-v2.1.0--dev-green.svg)](CHANGELOG_en.md)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

SuperNova is an **Autonomous Multi-Agent Runtime** focused on high performance, high extensibility, state isolation, and long-term cognitive evolution. Built on top of [Bun](https://bun.sh/), it adopts an event-driven architecture, a universal agent container, and highly modular design, empowering agents to maintain robust cognition, memory, and multi-agent synergy across long-horizon complex tasks.

> **Predecessor**: [Proj.Nova](https://github.com/yan-930521/Proj.Nova/)

> [!WARNING]
> **Security Notice**: Certain tools (such as terminal execution) operate directly on the system. Please only run this runtime inside isolated environments (VMs or Docker containers) and never deploy to production containing confidential data without sandboxing.

---

## Quick Start

**Prerequisites**: [Bun](https://bun.sh/) >= 1.3.14 · [Git](https://git-scm.com/) >= 2.x · OpenAI API Key

```bash
# 1. Install dependencies
bun install

# 2. Configure environment variables
cp .env.template .env
# Edit .env and supply your OPENAI_API_KEY

# 3. Run interactive demo (real LLM inference)
bun run demo

# 4. Type checking & unit tests
bun x tsc --noEmit
bun test
```

> For configuration details, refer to `config.yaml` in the root directory. For more demo scripts (memory, task systems, benchmarks), check `scripts` in `package.json`.

---

## Core Features

### Multi-Agent Collaboration System
- **Universal Agent Container**: A minimal host container (<400 lines of code) replaces inheritance trees. All cognitive and functional capabilities are hot-pluggable organ modules (`IAgentModule`), flexibly assembled into specialized roles based on task requirements.
- **Task DAG Engine (`TaskDAG` & `PlannerModule`) `[Refactoring]`**: Automated task scheduling, dependency unlocking, and self-reflection based on LATS (Language Agent Tree Search) Monte Carlo tree search and directed acyclic graphs.
- **Fine-Grained Tools & Dynamic Permissions (`SupervisorModule`) `[Refactoring]`**: Dynamically allocates toolsets according to agent roles; high-risk operations require dynamic authorization and review by supervisory organs.

### Memory & Context Management
- **Sliding Window Compaction**: Historical dialogue compression and compaction, paired with two-tier payload offloading to prevent token explosion and OOM.
- **Hybrid Graph-Vector Memory (`MemoryModule`) `[Completed]`**: Long-term memory automatically distills entity-relation triplets and semantic embeddings powered by `BaseJsonRepository` and local `vectra` vector store. Subgraphs are automatically injected before thinking, complemented by an active `recall_memory` tool.

### Self-Evolving Skill Ecosystem (CodeSkill)
- **CodeSkill Self-Healing Loop `[Refactoring]`**: Agents dynamically author TypeScript skills at runtime, equipped with version control, success rate tracking, and rollback capabilities to form a self-evolving "create-test-debug-repair" loop.
- **Generic External Environment SDK `[Refactoring]`**: Generic environment abstraction layer seamlessly adapting to Minecraft, Line Bot, web scrapers, or any external domain.
- **Novalink Bi-Directional Communication `[Refactoring]`**: Bi-directional communication architecture based on WebSocket JSON-RPC 2.0, providing low latency and offloading physics calculations to the backend server.

### Engineering Infrastructure
- **Micro-Kernel Architecture & Unified Lifecycle (`@supernova/runtime`)**: Provides 5-stage state transitions, service dependency injection pools, deduplication protection, and reverse-order graceful shutdown guarantees.
- **Strongly-Typed EventBus (`@supernova/events`)**: Fully asynchronous EventBus supporting generic inference and before/after step hooks. Agents suspend upon tool calls and resume upon completion, ensuring non-blocking operations throughout.
- **Workspace Isolation Sandbox `[Refactoring]`**: Independent sandbox environments per Session, ensuring operations are traceable and rollable.

---

## Architecture Documentation Navigation

Full architecture specifications are organized in the `docs/` directory:

- **Global Architecture & Philosophy**: [System Architecture Blueprint (ARCH.md)](docs/ARCH.md) · [Architecture Philosophy & Patterns (Overview)](docs/architecture/overview.md)
- **Agent Core & Organs**: [Universal Agent Container](docs/architecture/agent/universal_agent.md) · [Module Interface Specification](docs/architecture/agent/module_interface.md) · [Prompt Engine](docs/architecture/agent/prompt_engine.md) · [Standard Organ Modules](docs/architecture/modules/)
- **Messaging & Session Subsystem**: [Session Entity](docs/architecture/messaging/session.md) · [Session Manager](docs/architecture/messaging/session_manager.md) · [Message Router](docs/architecture/messaging/message_router.md) · [DataBlock & Payload Offload](docs/architecture/messaging/datablock.md)
- **Task Orchestration Subsystem**: [TaskDAG](docs/architecture/task/task_dag.md) · [Task Dispatcher](docs/architecture/task/task_dispatcher.md)
- **Micro-Kernel Infrastructure**: [Micro-Kernel](docs/architecture/kernel/micro_kernel.md) · [EventBus](docs/architecture/kernel/event_bus.md) · [Config System](docs/architecture/kernel/config_system.md) · [LLM Provider](docs/architecture/kernel/llm_provider.md)
- **Storage & Persistence**: [Repository Pattern](docs/architecture/storage/repository_pattern.md) · [File System Storage](docs/architecture/storage/file_system_storage.md)
- **API Specs & Contracts**: [Event Catalogue](docs/api/event_catalogue.md) · [Module Contract Guide](docs/api/module_contract.md)

> Reports & Advanced Reading: [Performance Benchmark (BENCHMARK.md)](demo/benchmark/BENCHMARK.md) · [Roadmap (ROADMAP_en.md)](ROADMAP_en.md) · [Changelog (CHANGELOG_en.md)](CHANGELOG_en.md)

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to understand development guidelines and pull request workflows.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.
