# SuperNova Changelog

All notable changes, architectural refactorings, and performance optimizations for the SuperNova system are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Long-Term Memory & Knowledge Graph Organ (MemoryModule & Knowledge Graph Engine)**:
  - **Organ Interface & Lifecycle Integration**: Implemented long-term memory organ adhering to `IAgentModule` (priority: 20, requires: `['profile', 'history']`).
  - **Pre-Step Semantic Search (`onBeforeRun`)**: Extracts conversation keywords and questions, queries embeddings for similarity, and injects 1-hop/multi-hop subgraph Markdown topologies into `PromptSectionIndex.MEMORY_CONTEXT (3)`.
  - **Post-Step Background Asynchronous Extraction (`onAfterRun`)**: Asynchronously calls the `EXTRACTION` preset model in the background after inference to distill entity-relation triplets (Subject-Predicate-Object) and update the graph without blocking immediate responses.
  - **Active Recall Tool (`recall_memory`)**: Standard Tool allowing the model to actively search long-term facts, entity attributes, and user preferences during reasoning.
  - **Public Extraction Method (`extractMemory`)**: Supports manual conversation ingestion and awaiting disk persistence completion.
- **Knowledge Graph & Vector Persistence Repository (JsonGraphRepository)**:
  - **Two-Tier Storage Architecture**: Inherits `@supernova/storage`'s `BaseJsonRepository`. Nodes and edges are atomically saved to `nodes.json` and `edges.json`, while vector indices are managed by `vectra` in `index/`.
  - **Vector Strip Optimization**: High-dimensional embedding arrays are stripped prior to JSON serialization, significantly reducing disk footprint and deserialization memory overhead.
  - **Graph Traversal & Hybrid Retrieval**: Supports CRUD, cascade deletion, vector similarity search (`searchNodesByVector`), multi-hop subgraph expansion (`getSubgraph`), and contextual retrieval (`searchGraphContext`).
- **End-to-End Test & Verification Demo (`demo/test_memory.ts`)**:
  - Rewrote the demo script using the V2 composable architecture, fully covering entity extraction, topology verification, natural language vector subgraph search, `recall_memory` tool invocation, and reverse-order graceful shutdown.

### Changed
- **Repository Singleton Pattern & IoC Injection**:
  - Overhauled `FileSystemProfileRepository` and `JsonGraphRepository` to be instantiated externally as singletons and injected via constructors, preventing in-module duplicates and file-handle race conditions.
  - Enforced the Virtual Actor model by isolating agent profile configurations in `sessions/<sessionId>/agents/<agentId>/profile.json`.

---

## [2.0.0] - 2026-09-23
### Added
- **Composable Agent Architecture (UniversalAgent)**:
  - **Pure Container & Decoupled Organs**: Replaced class inheritance with a lightweight host container `UniversalAgent` (<400 LOC). All specialized capabilities exist as hot-pluggable organ modules (`IAgentModule`).
  - **Standard Step Loop**: Encapsulated standard inference pipeline: BeforeStep → BuildPrompt → CollectTools → CallModel → AfterStep.
  - **Dynamic Prompt Engine**: Strict hierarchical index (`PromptSectionIndex` 1~10) supporting modular dual-key sorting and dynamic assembly.
- **Identity & Protocol Organ (ProfileModule)**:
  - Supports loading structured Profile JSON personas (including Xiamo main consciousness).
  - Recursive prompt loader (`PromptLoader`) equipped with LRU TTL caching.
  - Supports `llmPreset` suggestions in profile, dynamically switching model configuration via `agent.setPresetName()`.
- **Session History Organ & Two-Tier Offload (HistoryModule & Two-Tier Offload)**:
  - Added new message real-time offload threshold (`offload_threshold_new_message`, 2KB) and older sliding window compaction threshold (`offload_threshold_compact`, 512B).
  - Automatically offloads large payloads to independent Blob files referenced by URI (`blob://`), preventing context bloat and OOM.
- **Micro-Kernel Runtime Infrastructure (@supernova/runtime)**:
  - Implemented 5-stage lifecycle state machine (`INITIALIZING` → `BOOTING` → `RUNNING` → `STOPPING` → `STOPPED`).
  - Implemented dependency injection service registry, deduplication protection, and hot-pluggable plugin mechanism.
  - Reverse-order graceful shutdown guaranteeing components stop in the exact opposite order of registration.
- **Strongly-Typed EventBus (@supernova/events)**:
  - Type-safe publish/subscribe bus with generic inference across system, session, agent, and step hook chains.
- **Session Recovery**:
  - Restores `SUSPENDED` sessions from disk back to `ACTIVE` in batch during `SessionManager.start()`.
- **System Architecture Documentation**:
  - Created 20+ architectural specifications under `docs/` covering topology, messaging, organs, kernel, and APIs.

### Changed
- **Strict Zod Typing**:
  - Deprecated Zod `.passthrough()` and manually declared strict types for model inference settings (`reasoning`, `parallel_tool_calls`, `service_tier`).
  - Updated `config.yaml` to integrate real `gpt-5.6-luna` and `gpt-4o-mini` models.
- **InboxBuffer Memory Freeing & Persistence Sync**:
  - Fixed `Session.popInbox` to delete the map key rather than merely clearing arrays, freeing memory.
  - Added immediate asynchronous session saving in `MessageRouter` upon popping messages, preventing duplicate message processing on recovery.

### Removed
- Removed outdated `coreCapabilitiesModule` and mock-based testing scaffolding in favor of production-ready components.

---

## [0.2.4] - 2026-08-28
### Added
- **String Array RBAC System**:
  - **Fine-Grained Tool Permissions**: Replaced BitField implementation with string-array `AgentPermissions` for dynamic scalability. Enforces permission checks inside `BaseTool.execute`.
  - **Two-Stage Privilege Gate**: Decoupled global features from agent permissions with runtime authorization checks.
- **Global Feature Toggles**:
  - Extracted feature flags into a unified `FeaturesConfig` section for clean system-level control.

### Changed
- **Application Lifecycle Management**:
  - Implemented `SuperNovaApp` facade class unifying CLI execution, initialization, and `SIGINT/SIGTERM` graceful shutdown traps.
- **Dynamic Privilege Invalidation**:
  - Updated tool signature calculation to include permissions, invalidating outdated agent instances on permission updates.

---

## [0.2.3] - 2026-08-26
### Added
- **Virtual Environment Communication & SDK Upgrade**:
  - **Novalink Bi-Directional Architecture (WebSocket JSON-RPC)**: Replaced polling with a single WebSocket full-duplex connection.
  - **Environment Interface Refactoring**: Introduced `IBody` interface; offloaded physics to backend server.
  - **LLM Type Declaration Isolation**: Added `NovaLink.d.ts` without module syntax to reduce hallucinations.

### Changed
- **LATS Planning Engine Optimization**: Separated expansion schemas, added trajectory context, and upgraded evaluation to parallel execution (`Promise.all`).

---

## [0.2.2] - 2026-08-11
### Added
- **Multi-Agent EmbodiedEnv Isolation**: Implemented `BaseEmbodiedEnv` as global singleton with dynamic mounting (`registerAgent` / `unregisterAgent`) and compound session-level cache isolation (`${sessionId}:${agentId}:${skillId}`).

---

## [0.2.1] - 2026-08-10
### Added
- **Skill Caching & Lifecycle**: Integrated `LRUCache` into `SkillManager` with eviction hooks (`onEvict`).
- **Self-Healing Cache Invalidation**: Automatic cache invalidation upon skill source code modification.
- **Underworld Migration**: Migrated Minecraft environment to generalized `CodeSkill` infrastructure.

---

## [0.2.0] - 2026-08-09
### Added
- **Embodied Agent Self-Evolving CodeSkill Ecosystem**: Dynamic versioning, indirection pointers, automated rollback, and generic environment SDK abstraction.
