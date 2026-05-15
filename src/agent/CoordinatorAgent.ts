import { BaseAgent } from './BaseAgent';
import { logger } from '../infra/LogManager';

import type { ICoordinator } from '../../interfaces/agent/ICoordinator';
import type { IMutationRequest } from '../../interfaces/models/IMutationRequest';
import type { ITaskPlanEngine, ITaskGraph } from '../../interfaces/agent/ITaskPlanEngine';
import type { IAgentState } from '../../interfaces/agent/IAgentState';
import type { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';

/**
 * CoordinatorAgent 類
 * 負責協調多個 Agent 的提議並進行衝突裁決，以及利用 TaskPlanEngine 進行任務規劃。
 */
export class CoordinatorAgent extends BaseAgent implements ICoordinator {
	constructor(
		private planEngine?: ITaskPlanEngine,
		private agentRegistry?: IAgentRegistry
	) {
		super();
		if (this.planEngine) {
			this._isReady = true;
		}
	}

	/**
	 * 執行階層式衝突裁決
	 * @param proposals 原始變更請求列表
	 */
	async arbitrateMutations(proposals: IMutationRequest[]): Promise<IMutationRequest[]> {
		const winners = new Map<string, IMutationRequest>();

		proposals.forEach((proposal) => {
			const existing = winners.get(proposal.target_hook);
			if (!existing) {
				winners.set(proposal.target_hook, proposal);
			} else {
				// 裁決邏輯：保留 priority 最高的一個。如果優先級相同，保留最早提交的。
				if (proposal.priority > existing.priority) {
					winners.set(proposal.target_hook, proposal);
				}
				// 如果 priority 相同，因為我們是按順序遍歷，existing 已經是較早的一個，所以不更新。
			}
		});

		return Array.from(winners.values());
	}

	/**
	 * 基於目標生成任務的有向無環圖 (DAG)
	 * @param goal 任務目標描述
	 */
	async planTaskGraph(goal: string): Promise<ITaskGraph> {
		logger.info(`[CoordinatorAgent ${this.id}] Planning task graph for goal: ${goal}`, { agent_id: this.id, type: 'PLAN' });

		if (!this.planEngine) {
			throw new Error(`TaskPlanEngine not injected into CoordinatorAgent ${this.id}`);
		}

		// 1. 建立初始狀態
		const initialState = this.createInitialState(goal);

		// 2. 注入可用 Agent 資訊
		if (!initialState.metadata?.available_agents || initialState.metadata.available_agents.length === 0) {
			initialState.metadata = {
				...initialState.metadata,
				available_agents: this.resolveAvailableAgents()
			};
		}

		// 3. 執行規劃引擎 (LangGraph 流程)
		const finalState = await this.planEngine.run(initialState);

		// 4. 檢查規劃結果
		if (!finalState.planning.taskGraph) {
			throw new Error(`TaskPlanEngine failed to produce a TaskGraph for goal: ${goal}`);
		}

		return finalState.planning.taskGraph;
	}

	/**
	 * 當任務失敗時，請求重新規劃任務圖
	 * @param goal 原始目標
	 * @param failedTaskId 失敗的任務 ID
	 * @param error 錯誤訊息
	 * @param currentState 當前 Agent 狀態
	 */
	async requestReplan(
		goal: string,
		failedTaskId: string,
		error: string,
		currentState: IAgentState
	): Promise<ITaskGraph> {
		logger.info(`[CoordinatorAgent ${this.id}] Requesting replan for failed task: ${failedTaskId}`, { agent_id: this.id, type: 'PLAN' });

		if (!this.planEngine) {
			throw new Error(`TaskPlanEngine not injected into CoordinatorAgent ${this.id}`);
		}

		// 1. 注入可用 Agent 資訊 (如果 metadata 中尚未包含)
		if (!currentState.metadata?.available_agents || currentState.metadata.available_agents.length === 0) {
			currentState.metadata = {
				...currentState.metadata,
				available_agents: this.resolveAvailableAgents()
			};
		}

		// 2. 執行規劃引擎的重新規劃邏輯
		const replanResult = await this.planEngine.replan(currentState, failedTaskId, error);

		// 2. 獲取更新後的任務圖
		const updatedTaskGraph = replanResult.planning?.taskGraph;

		if (!updatedTaskGraph) {
			throw new Error(`TaskPlanEngine failed to produce an updated TaskGraph during replan for goal: ${goal}`);
		}

		return updatedTaskGraph;
	}

	/**
	 * 根據配置中的 ID 列表解析為完整的 Agent 資訊
	 */
	private resolveAvailableAgents(): any[] {
		const agentIds = this._config.availableAgents || [];
		if (!Array.isArray(agentIds)) return [];

		// 如果沒有傳入 AgentRegistry，則無法解析，返回空列表
		if (!this.agentRegistry) {
			logger.warn(`[CoordinatorAgent ${this.id}] AgentRegistry not available. Cannot resolve availableAgents.`, { agent_id: this.id, type: 'PLAN' });
			return [];
		}

		return agentIds.map(id => {
			const agent = this.agentRegistry?.getAgent(id);
			if (agent) {
				return {
					id: agent.id,
					role: agent.role,
					capabilities: agent.capabilities || []
				};
			}
			logger.warn(`[CoordinatorAgent ${this.id}] Available agent with ID ${id} not found in registry.`, { agent_id: this.id, type: 'PLAN' });
			return null;
		}).filter(a => a !== null);
	}

	/**
	 * 建立初始規劃狀態
	 */
	private createInitialState(goal: string): IAgentState {
		return {
			goal,
			currentTask: "",
			messages: [],
			thoughtTree: {
				nodes: [],
				rootId: null,
				activeNodeId: null,
				iterationCount: 0,
			},
			planning: {
				milestones: [],
				currentMilestoneIdx: 0,
				taskGraph: null,
				projectedContext: {},
			},
			lastEvaluations: [],
			errors: [],
			metadata: {
				agentId: this.id,
				role: this.role
			}
		};
	}

}
