# SuperNova

[English](README_en.md) | [繁體中文](README.md)

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#core-features)
[![Stage](https://img.shields.io/badge/Stage-v0.2.2-green.svg)](CHANGELOG_en.md)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

SuperNova is an **Agent Runtime** focusing on performance and state management. Running on Bun, it leverages an event-driven architecture to solve common issues in long-running AI systems — such as context explosion and goal drift — enabling Agents to maintain stable cognition and execution during complex, long-term tasks.

> **Project Predecessor**: [Proj.Nova](https://github.com/yan-930521/Proj.Nova/)

> [!WARNING]
> **Security Warning**: Some tools (e.g., `RunBashTool`) have not yet implemented sandboxing. Run this system **only within isolated VMs or Docker containers**. Do not deploy on production servers containing sensitive data.

> [!NOTE]
> **About Code Comments & Language**: Inline code comments are written in Traditional Chinese. However, the system architecture, variables, function names, and typings are strictly maintained in English. Comprehensive English documentation is provided to help you grasp the core concepts without language barriers.

---

## Quick Start

**Prerequisites**: [Bun](https://bun.sh/) >= 1.3.14 · [Git](https://git-scm.com/) >= 2.x · OpenAI API Key · Tavily API Key

```bash
# Install dependencies
bun install

# Configure environment variables
cp .env.template .env
# Edit .env and fill in your OpenAI API Key and Tavily API Key

# Run the main demo
bun run demo

# Type checking and tests
bun run lint
bun test
```

> For system configuration, see `config.yaml` in the root directory. For additional demo scripts (task system, memory system, performance benchmarks), see the scripts in `package.json`.

---

## Core Features

### Multi-Agent Collaboration
- **Multi-Brain Architecture**: `MainAgent` (decision & scheduling), `TaskAgent` (focused task execution), and `EmbodiedAgent` (environment perception & manipulation) — separation of concerns to prevent Prompt pollution.
- **Dynamic Context Projection**: The main brain can seamlessly take over a sub-agent's history and toolset to personally handle high-difficulty tasks.
- **Task DAG Engine**: Automated task scheduling and dependency resolution powered by LATS (Language Agent Tree Search) strategy planning and directed acyclic graphs. (See planner output examples: [Holistic Mode](demo/lats_holistic.txt) and [Step-by-step Mode](demo/lats_step_by_step.txt))
- **Fine-grained Tool Permissions**: Dynamically assign toolsets based on agent roles, strictly enforcing permission boundaries.

### Memory & Context Management
- **Graph-Vector Hybrid Memory**: Long-term memory auto-extracts entity-relation graphs; episodic memory condenses idle conversations into AI diaries; relevant context is auto-injected before each thinking step.
- **Sliding Window Compaction**: Conversation history is automatically compressed and offloaded, with Payload Offloading to prevent token overflow and OOM.
- **State Persistence**: Idle Agents are automatically serialized to disk (Dehydrate) and restored on demand (Rehydrate).

### Self-Evolving Skill Ecosystem (CodeSkill)
- Agents can dynamically write TypeScript skills at runtime, with built-in version control, success rate tracking, and auto-rollback — forming a complete "create-test-debug-fix" self-healing loop.
- Generic environment SDK that seamlessly adapts to Minecraft, Line Bot, web crawlers, or any external domain.

### Engineering Infrastructure
- **Event-Driven**: Fully asynchronous EventBus architecture — Agents suspend after tool calls and wake on completion, entirely non-blocking.
- **Clean Architecture**: Four-layer decoupling across `domain` / `infra` / `tools` / `prompts`, with IoC container and Zod-based strongly-typed config engine.
- **Git Worktree Isolation**: Each Session gets an independent branch — operations are traceable and rollback-ready.

> Learn more: [Architecture Blueprint (ARCH.md)](docs/ARCH.md) · [Performance Benchmark](demo/benchmark/BENCHMARK_en.md) · [Roadmap (ROADMAP_en.md)](ROADMAP_en.md) · [Changelog (CHANGELOG_en.md)](CHANGELOG_en.md)

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first to understand the development guidelines and submission process.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.
