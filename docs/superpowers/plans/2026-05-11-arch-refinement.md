# SuperNova Architecture Refinement (Task 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `ARCH.md` to reflect enhancements in tool stability and system-wide observability.

**Architecture:** Integrate a `Guardian` interface for tool isolation and a `TraceContext` for message tracking to ensure system stability and causality tracking.

**Tech Stack:** Markdown

---

### Task 1: Update CAPABILITY & TOOL SYSTEM Section

**Files:**
- Modify: `D:\Dev\Projects\Special\SuperNova\ARCH.md`

- [ ] **Step 1: Update the Tool description with stability requirements**

Update the `CAPABILITY & TOOL SYSTEM` section to include the `Guardian` interface and its responsibilities.

```markdown
└── Tool
    → 最底層執行單元（Move / Compute / Query / Act）
    │
    └── Guardian Interface (穩定性守護接口)
        ├── Timeout Control
        │   → 工具執行必須具備超時限制，防止單一 Tool 阻塞整個系統 Tick
        └── Exception Isolation
            → 捕獲並隔離 Tool 執行期的錯誤，確保異常不影響系統主循環 (Main Tick)
```

### Task 2: Update COMMUNICATION MODEL Section

**Files:**
- Modify: `D:\Dev\Projects\Special\SuperNova\ARCH.md`

- [ ] **Step 1: Update the Message description with TraceContext and session_id**

Update the `COMMUNICATION MODEL` section to include `TraceContext` and the requirement for `session_id`.

```markdown
├── Message
│   → Agent 間標準化訊息格式
│   │
│   └── TraceContext (觀測性追蹤上下文)
│       ├── session_id
│       │   → 強制攜帶的會話標識，確保所有異步行為皆能歸因並記錄至 OpLog
│       └── span_id / parent_id
│           → 追蹤訊息因果鏈，實現完整的系統行為可觀測性
```
