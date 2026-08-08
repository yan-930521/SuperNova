export class LATSNode {
    public id: string;
    public children: LATSNode[] = [];
    
    // MCTS Statistics
    public visits: number = 0;
    public value: number = 0;

    // LATS Specific
    /** 這個節點的行動/決策描述 (例如: "首先拆解出資料庫相關任務") */
    public action: string;
    /** 當前的任務策略狀態草稿 */
    public state: string;
    /** LLM 給予此節點的反思與評價 (Critique) */
    public reflection?: string;
    /** 是否已經是一個完整的、可結束的策略 */
    public isTerminal: boolean = false;

    constructor(
        public readonly parent: LATSNode | null,
        action: string,
        state: string,
        id?: string
    ) {
        this.id = id ?? Math.random().toString(36).substring(2, 9);
        this.action = action;
        this.state = state;
    }

    /** 
     * UCB1 (Upper Confidence Bound) 計算
     * 選擇最具潛力的子節點
     */
    public getUCB(explorationWeight: number = Math.SQRT2): number {
        if (this.visits === 0) return Infinity; // 未探索過的節點優先
        
        // 平均價值 (0~1)
        const exploitation = this.value / this.visits; 
        
        if (!this.parent) return exploitation;

        // 探索獎勵
        const exploration = explorationWeight * Math.sqrt(Math.log(this.parent.visits) / this.visits);
        return exploitation + exploration;
    }

    /**
     * 取得從根節點到此節點的完整策略軌跡
     */
    public getTrajectory(): LATSNode[] {
        const path: LATSNode[] = [];
        let curr: LATSNode | null = this;
        while (curr) {
            path.unshift(curr);
            curr = curr.parent;
        }
        return path;
    }

    /**
     * 從整個子樹中找出最優（平均價值最高且最深/完成）的節點
     */
    public getBestSolution(): LATSNode {
        let best: LATSNode = this;
        let maxScore = -Infinity;

        const traverse = (node: LATSNode) => {
            const score = node.visits > 0 ? (node.value / node.visits) : 0;
            // 優先選擇完成的策略，或是分數最高的策略
            if (node.isTerminal && score > maxScore) {
                maxScore = score;
                best = node;
            } else if (!best.isTerminal && score > maxScore) {
                maxScore = score;
                best = node;
            }

            for (const child of node.children) {
                traverse(child);
            }
        };

        traverse(this);
        return best;
    }
}
