import { z } from 'zod';

export const TASK_PROMPTS = {
    lats: {
        expansion_system: `You are a strategic task planner using Language Agent Tree Search.
Your goal is to decompose a complex objective into manageable tasks.
You are currently at a node in the search tree. Review the trajectory of how the plan evolved.
Propose 2 to 3 DIFFERENT next-step actions to refine or break down the plan further.
For each action, provide the FULL updated plan text. Ensure tasks are logically ordered and dependencies are clear.`,
        
        evaluation_system: `You are an expert project manager and architect evaluating a proposed task plan.
Critique the provided plan draft based on:
1. Feasibility and clarity of the tasks.
2. Correctness of dependencies (are there any missing steps? circular dependencies?)
3. Completeness (does it fully achieve the ultimate objective?)

Provide a score from 0 to 10. If the plan is 100% complete, flawless, and ready to be translated into a TaskDAG without any further refinement, set 'isTerminal' to true.`,

        expansion_system_stepwise: `You are a strategic task planner using step-by-step Language Agent Tree Search.
Your goal is to logically deduce the NEXT actionable steps towards a complex objective.
You are currently at a specific state in the reasoning tree. Review the trajectory of previous steps.
Propose 2 to 3 DIFFERENT possible next steps or tactical actions.
For each action, describe what the action is, and what the resulting state or consequence would be.`,

        evaluation_system_stepwise: `You are an expert strategist evaluating a specific step in a plan.
Critique the proposed next step based on:
1. Logical validity (does it naturally follow from the previous state?)
2. Impact (does it bring us closer to the ultimate objective?)
3. Risk and side effects.

Provide a score from 0 to 10. If this step unequivocally achieves the final objective and no further actions are needed, set 'isTerminal' to true.`
    },
    generator: {
        system: `You are a precise task translator. Your job is to read a complex project strategy and translate it directly into a strict Directed Acyclic Graph (DAG) of tasks.
Rules:
1. 'id' must be unique, lowercase, and have no spaces.
2. 'objective' must be clear and actionable.
3. 'dependencies' must accurately reflect the prerequisites mentioned in the strategy. Ensure there are NO circular dependencies.`
    }
};

export const ExpansionSchemaHolistic = z.object({
    proposals: z.array(z.object({
        action: z.string().describe('The strategic action taken to refine or expand the plan'),
        state: z.string().describe('The complete text draft of the task plan resulting from this action')
    }))
});

export const ExpansionSchemaStepwise = z.object({
    proposals: z.array(z.object({
        action: z.string().describe('The specific tactical next step or action to take'),
        state: z.string().describe('The immediate consequence, outcome, or updated state after executing ONLY this step')
    }))
});

export const ReflectionSchemaHolistic = z.object({
    score: z.number().min(0).max(10).describe('Score from 0 to 10 evaluating the feasibility, completeness, and lack of deadlocks in the plan.'),
    reflection: z.string().describe('Critique on why this score was given, and what flaws/deadlocks might exist.'),
    isTerminal: z.boolean().describe('True if this plan is perfectly complete, actionable, and needs no further refinement.')
});

export const ReflectionSchemaStepwise = z.object({
    score: z.number().min(0).max(10).describe('Score from 0 to 10 evaluating if this step is logical, high-impact, and low-risk.'),
    reflection: z.string().describe('Critique on why this step is good or bad, and what risks it introduces.'),
    isTerminal: z.boolean().describe('True if the ultimate objective has been unequivocally achieved by this step.')
});

export const DAGSchema = z.object({
    tasks: z.array(z.object({
        id: z.string().describe('Unique ID for the task (lowercase, no spaces, e.g. "init_db")'),
        objective: z.string().describe('Clear, actionable instructions for the task agent'),
        dependencies: z.array(z.string()).describe('List of task IDs that must be completed before this task can start')
    }))
});
