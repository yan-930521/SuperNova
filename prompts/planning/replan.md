# Replanning Request

The agent is working towards the following goal:
{goal}

A task has failed during execution.

## Failed Task Details
- ID: {failed_task_id}
- Goal: {failed_task_goal}
- Error: {error}

## Execution History
{history}

## Current Task Graph
{current_graph}

## Instruction
Analyze the failure and provide an updated set of tasks (TaskGraph) to either:
1. Fix the issue and retry the failed task.
2. Bypass the failed task if it's no longer necessary.
3. Adjust subsequent tasks to account for the failure.

The response MUST strictly follow the requested JSON schema.

### Recovered Task Graph
Nodes should include all necessary tasks (including those already completed if they are still relevant, or only the new/adjusted ones depending on how the executor merges them). For this implementation, provide the *full* updated set of tasks for the current milestone.
