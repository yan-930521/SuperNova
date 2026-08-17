import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { LLMProvider } from '../../infra/llm/LLMProvider';
import { LogManager } from '../../infra/LogManager';
import { ExpansionSchemaHolistic, ExpansionSchemaStepwise, ReflectionSchemaHolistic, ReflectionSchemaStepwise, TASK_PROMPTS } from '../../prompts/task.prompt';
import { LATSNode } from './LATSNode';

export interface LATSPlannerOptions {
    objective: string;
    context: string;
    maxIterations?: number;
    mode?: 'holistic' | 'step_by_step';
    scoringCriteria?: string;
    expansionHint?: string;
}


export class LATSPlanner {
    constructor(private readonly llmProvider: LLMProvider) {}

    /**
     * 執行 MCTS/LATS 演算法，搜尋並產出最佳文字策略
     * @param options 搜尋選項 (目標、模式、最大回合、自訂評分標準等)
     */
    public async search(options: LATSPlannerOptions): Promise<string> {
        const { objective, context, maxIterations = 5, mode = 'holistic', scoringCriteria, expansionHint } = options;
        LogManager.recorder.debug(`[LATSPlanner] Starting search for objective: "${objective.substring(0, 50)}..." (Mode: ${mode}, Max Iterations: ${maxIterations})`);
        const rootState = `Objective: ${objective}\nContext: ${context}\nPlan: (Not started)`;
        const root = new LATSNode(null, 'Initialize', rootState);
        
        for (let i = 0; i < maxIterations; i++) {
            LogManager.recorder.debug(`[LATSPlanner] --- Iteration ${i + 1}/${maxIterations} ---`);
            
            // 1. Selection
            const nodeToExpand = this.select(root);
            LogManager.recorder.debug(`[LATSPlanner] Selected node for expansion: "${nodeToExpand.action}"`);
            
            if (nodeToExpand.isTerminal) {
                LogManager.recorder.debug(`[LATSPlanner] Node is terminal (score: ${nodeToExpand.value / (nodeToExpand.visits || 1)}). Backpropagating...`);
                this.backpropagate(nodeToExpand, nodeToExpand.value / (nodeToExpand.visits || 1));
                continue;
            }

            // 2. Expansion
            LogManager.recorder.debug(`[LATSPlanner] Expanding node... Calling LLM...`);
            const children = await this.expand(nodeToExpand, options);
            if (children.length === 0) {
                LogManager.recorder.warn(`[LATSPlanner] Expansion failed (Dead end). Backpropagating score 0.`);
                this.backpropagate(nodeToExpand, 0);
                continue;
            }
            nodeToExpand.children = children;
            LogManager.recorder.debug(`[LATSPlanner] Expanded into ${children.length} candidate actions.`);

            // 3. Simulation & Evaluation (Reflection)
            await Promise.all(children.map(async (child, j) => {
                const { score, reflection, isTerminal } = await this.evaluate(child, options);
                child.reflection = reflection;
                child.isTerminal = isTerminal;
                
                LogManager.recorder.debug(`[LATSPlanner] Evaluated child ${j + 1}/${children.length}: "${child.action}" -> Score: ${score}/10, Terminal: ${isTerminal}`);
                
                const normalizedValue = score / 10;
                
                // 4. Backpropagation
                this.backpropagate(child, normalizedValue);
            }));
        }

        const bestNode = root.getBestSolution();
        const trajectory = bestNode.getTrajectory();
        LogManager.recorder.debug(`[LATSPlanner] Search complete. Best trajectory depth: ${trajectory.length}`);
        
        const finalStrategy = trajectory
            .map((n, idx) => `### Step ${idx}: ${n.action}\n\n**Plan Draft**: \n${n.state}\n\n**Feedback**: \n${n.reflection || 'N/A'}`)
            .join('\n\n---\n\n');
            
        return finalStrategy;
    }

    private select(node: LATSNode): LATSNode {
        let current = node;
        while (current.children.length > 0) {
            let bestChild = current.children[0];
            let bestUCB = -Infinity;
            for (const child of current.children) {
                const ucb = child.getUCB();
                if (ucb > bestUCB) {
                    bestUCB = ucb;
                    bestChild = child;
                }
            }
            current = bestChild;
        }
        return current;
    }

    private backpropagate(node: LATSNode, score: number): void {
        let current: LATSNode | null = node;
        while (current) {
            current.visits++;
            current.value += score;
            current = current.parent;
        }
    }

    private async expand(node: LATSNode, options: LATSPlannerOptions): Promise<LATSNode[]> {
        const history = node.getTrajectory().map(n => `Action: ${n.action}\nState: ${n.state}\nFeedback: ${n.reflection || 'None'}`).join('\n---\n');
        
        let systemPrompt = options.mode === 'step_by_step' ? TASK_PROMPTS.lats.expansion_system_stepwise : TASK_PROMPTS.lats.expansion_system;
        
        if (options.expansionHint) {
            systemPrompt += `\n\nExpansion Hint / Direction:\n${options.expansionHint}`;
        }

        const schema = options.mode === 'step_by_step' ? ExpansionSchemaStepwise : ExpansionSchemaHolistic;
        const model = this.llmProvider.getModel().withStructuredOutput(schema);
        
        try {
            const result = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Current Trajectory:\n${history}\n\nWhat are the next possible actions?`)
            ]);

            return result.proposals.map((p: any) => new LATSNode(node, p.action, p.state));
        } catch (e: any) {
            LogManager.recorder.error('[LATSPlanner] Expansion failed:', e);
            return [];
        }
    }

    private async evaluate(node: LATSNode, options: LATSPlannerOptions): Promise<{ score: number, reflection: string, isTerminal: boolean }> {
        let systemPrompt = options.mode === 'step_by_step' ? TASK_PROMPTS.lats.evaluation_system_stepwise : TASK_PROMPTS.lats.evaluation_system;
        
        if (options.scoringCriteria) {
            systemPrompt += `\n\nAdditional Scoring Criteria:\n${options.scoringCriteria}`;
        }

        const schema = options.mode === 'step_by_step' ? ReflectionSchemaStepwise : ReflectionSchemaHolistic;
        const model = this.llmProvider.getModel().withStructuredOutput(schema);
        
        const history = node.getTrajectory().map(n => `Action: ${n.action}\nState: ${n.state}`).join('\n---\n');
        const evaluationPrompt = options.mode === 'step_by_step' 
            ? `Current Trajectory:\n${history}\n\nEvaluate the LAST step in the trajectory above.`
            : `Evaluate this plan draft:\n\n${node.state}`;

        try {
            const result = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(evaluationPrompt)
            ]);

            return {
                score: result.score,
                reflection: result.reflection,
                isTerminal: result.isTerminal
            };
        } catch (e: any) {
            LogManager.recorder.error(`[LATSPlanner] Evaluation failed: ${e.message}`);
            return { score: 0, reflection: 'Evaluation failed', isTerminal: false };
        }
    }
}
