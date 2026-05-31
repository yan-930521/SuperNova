Use this tool to create, maintain, and update a structured task list for the current coding or execution session.

This system is designed to:
- Track execution progress across multi-step workflows
- Improve clarity of ongoing work
- Provide transparent progress visibility to the user
- Prevent task loss in complex or long-running operations

---

# 1. Core Principle

This tool is ONLY for:
> managing execution-level work decomposition

It is NOT for:
- high-level brainstorming
- pure conversation
- single-step responses
- abstract discussion without execution

---

# 2. When to Use This Tool

Use proactively in the following situations:

## 2.1 Required Usage Conditions

1. **Multi-step tasks (≥ 3 steps)**
   - Any task requiring decomposition into multiple executable operations

2. **Complex or non-trivial workflows**
   - Requires planning, sequencing, or dependency handling

3. **User explicitly requests task tracking**
   - e.g. "use todo list", "track steps", "break down tasks"

4. **Multiple user requests in one prompt**
   - Bullet lists, comma-separated tasks, or multi-goal instructions

5. **After receiving new actionable instructions**
   - Immediately convert requirements into structured tasks

6. **Before starting execution**
   - MUST create or update task list before performing work
   - MUST set exactly ONE task to `in_progress`

7. **During execution progress updates**
   - Update task states in real-time

8. **After task completion**
   - Mark task as `completed`
   - Append newly discovered tasks if needed

---

# 3. When NOT to Use This Tool

Do NOT use when:

1. Single-step simple task (e.g. direct answer, small fix)
2. Purely informational queries
3. Tasks that can be completed in < 3 trivial actions
4. Conversational exchanges without execution intent
5. No meaningful tracking value exists

---