# Goal Dispatch Tool Specification

This tool is the entry point for submitting a high-level goal into the SuperNova execution system.

It accepts a goal and a self-contained description, then forwards them to a backend orchestration system that handles planning, decomposition, and execution.

---

# Input Schema

The tool accepts only:

- goal: a high-level objective to achieve
- description: a self-contained, execution-ready context

---

# Description Requirement (CRITICAL)

The `description` field MUST be fully self-contained.

It must include all information required for execution without access to the original conversation.

It MUST include:

- original user request
- objective and expected outcome
- relevant context and background
- constraints and limitations
- required resources (files, APIs, systems, datasets)
- important entities and identifiers
- known assumptions (if any)
- success criteria

The description is the single source of truth for downstream systems.

---

# System Behavior (Backend)

After submission, the backend system will automatically:

- interpret the goal
- construct internal task structure
- assign workers
- manage execution lifecycle

This behavior is NOT part of the tool interface.

---

# When to Use

Use this tool when:

- a high-level goal needs to be executed
- multi-step reasoning or execution is required
- the task requires backend orchestration
- long-horizon or complex objectives are involved

---

# When NOT to Use

Do NOT use this tool when:

- the request is single-step and directly answerable
- no execution is required
- the task is purely informational or explanatory
- user explicitly requests no execution or automation

---

# Key Principle

This tool is a submission interface only.

All planning, scheduling, and execution are handled by the backend system.