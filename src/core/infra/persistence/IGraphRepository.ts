import { IEntity, IRepository } from './IRepository';

/**
 * 實體節點 (Entity)
 */
export interface GraphNode extends IEntity {
    id: string; // 唯一識別，例如: "USER:Yan", "CONCEPT:TypeScript"
    label: string; // 節點標籤, e.g., "User", "Concept"
    memory: string; // 原始記憶或描述文本 (供 Vector Embedding 使用)
    embedding?: number[]; // 向量表示
    properties: Record<string, any>;
    createdAt: number;
    updatedAt: number;
}

/**
 * 實體關係邊 (Edge)
 */
export interface GraphEdge extends IEntity {
    id: string;
    sourceId: string;
    targetId: string;
    relation: string; // 例如: "LIKES", "KNOWS", "TRUSTS"
    weight?: number; // 關係權重或情緒強度 (0.0 ~ 1.0)
    properties: Record<string, any>; // 可存放情緒、時效性等 metadata
    createdAt: number;
    updatedAt: number;
}

/**
 * 圖譜儲存庫介面
 */
export interface IGraphRepository extends IRepository<GraphNode> {
    // ==========================================
    // 1. 節點操作 (Node Operations)
    // ==========================================
    addNode(sessionId: string, node: GraphNode): Promise<void>;
    updateNode(sessionId: string, node: GraphNode): Promise<void>;
    getNode(sessionId: string, id: string): Promise<GraphNode | null>;
    deleteNode(sessionId: string, id: string): Promise<void>;

    // ==========================================
    // 2. 邊操作 (Edge Operations)
    // ==========================================
    addEdge(sessionId: string, edge: GraphEdge): Promise<void>;
    updateEdge(sessionId: string, edge: GraphEdge): Promise<void>;
    getEdge(sessionId: string, id: string): Promise<GraphEdge | null>;
    getEdgesBySource(sessionId: string, sourceId: string): Promise<GraphEdge[]>;
    getEdgesByTarget(sessionId: string, targetId: string): Promise<GraphEdge[]>;
    deleteEdge(sessionId: string, id: string): Promise<void>;

    // ==========================================
    // 3. 語意檢索與圖遍歷 (Vector Search & Graph Traversal)
    // ==========================================
    searchNodesByVector(sessionId: string, vector: number[], topK?: number): Promise<GraphNode[]>;
    
    getSubgraph(sessionId: string, centerNodeId: string, depth?: number): Promise<{
        nodes: GraphNode[];
        edges: GraphEdge[];
    }>;
}
