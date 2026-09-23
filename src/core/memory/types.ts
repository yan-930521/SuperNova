/**
 * 實體節點 (GraphNode)
 * 知識圖譜中的基本語意單元，代表一個概念、實體、偏好或重要人物
 */
export interface GraphNode {
    /** 節點唯一識別碼 (例如: "USER:Yan", "CONCEPT:TypeScript") */
    id: string;
    /** 節點標籤或類別 (例如: "User", "Concept", "Tool", "Preference") */
    label: string;
    /** 節點原始記憶與敘述文字 (供 Embedding 向量化索引使用) */
    memory: string;
    /** 向量嵌入維度陣列 */
    embedding?: number[];
    /** 自訂擴充屬性 (例如權重、別名、標籤) */
    properties?: Record<string, any>;
    /** 建立時間戳 */
    createdAt: number;
    /** 最後更新時間戳 */
    updatedAt: number;
}

/**
 * 實體關係邊 (GraphEdge)
 * 知識圖譜中連接兩節點的具向語意關係 (主詞 - 謂詞 - 受詞)
 */
export interface GraphEdge {
    /** 關係邊唯一識別碼 */
    id: string;
    /** 起始節點 ID (Subject 主詞) */
    sourceId: string;
    /** 目標節點 ID (Object 受詞) */
    targetId: string;
    /** 關係謂詞 (Predicate，例如: "PREFERS", "USES", "DEVELOPED", "TRUSTS") */
    relation: string;
    /** 關係權重或親密度 (0.0 ~ 1.0) */
    weight?: number;
    /** 自訂關聯屬性 (例如時效、情境備註) */
    properties?: Record<string, any>;
    /** 建立時間戳 */
    createdAt: number;
    /** 最後更新時間戳 */
    updatedAt: number;
}

/**
 * 子圖檢索結果結構
 */
export interface SubgraphResult {
    /** 檢索召回之實體節點列表 */
    nodes: GraphNode[];
    /** 連接各節點之關係邊列表 */
    edges: GraphEdge[];
}

/**
 * 每日情節記憶摘要結構
 */
export interface EpisodicSummary {
    /** 歸納日期字串 (YYYY-MM-DD) */
    date: string;
    /** 所屬會話 ID */
    sessionId: string;
    /** Markdown 格式之當日關鍵情節總結內容 */
    summary: string;
    /** 歸納時間戳 */
    timestamp: number;
}

/**
 * 知識圖譜與向量記憶儲存庫介面 (IGraphRepository)
 */
export interface IGraphRepository {
    // ─── 1. 節點操作 ───
    addNode(sessionId: string, node: GraphNode): Promise<void>;
    updateNode(sessionId: string, node: GraphNode): Promise<void>;
    getNode(sessionId: string, id: string): Promise<GraphNode | null>;
    deleteNode(sessionId: string, id: string): Promise<void>;
    listNodes(sessionId: string): Promise<GraphNode[]>;

    // ─── 2. 關係邊操作 ───
    addEdge(sessionId: string, edge: GraphEdge): Promise<void>;
    updateEdge(sessionId: string, edge: GraphEdge): Promise<void>;
    getEdge(sessionId: string, id: string): Promise<GraphEdge | null>;
    getEdgesBySource(sessionId: string, sourceId: string): Promise<GraphEdge[]>;
    getEdgesByTarget(sessionId: string, targetId: string): Promise<GraphEdge[]>;
    deleteEdge(sessionId: string, id: string): Promise<void>;
    listEdges(sessionId: string): Promise<GraphEdge[]>;

    // ─── 3. 語意檢索與圖遍歷 ───
    /**
     * 依向量相似度檢索 Top-K 節點
     * @param sessionId 會話識別碼
     * @param vector 查詢向量
     * @param topK 最大返回筆數 (預設 5)
     */
    searchNodesByVector(sessionId: string, vector: number[], topK?: number): Promise<GraphNode[]>;

    /**
     * 取得特定節點為中心的一階或多階鄰居子圖
     * @param sessionId 會話識別碼
     * @param centerNodeId 中心節點 ID
     * @param depth 拓撲展開深度 (預設 1)
     */
    getSubgraph(sessionId: string, centerNodeId: string, depth?: number): Promise<SubgraphResult>;

    /**
     * 綜合向量搜尋與子圖擴展 (Search & Expand)
     * 先進行向量召回，再以召回節點為起點展開關聯子圖
     */
    searchGraphContext(
        sessionId: string,
        vector: number[],
        topK?: number,
        depth?: number
    ): Promise<SubgraphResult>;
}
