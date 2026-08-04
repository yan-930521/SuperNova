import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { LocalIndex } from 'vectra';

import { Config } from '../../../config/Config';
import { GraphEdge, GraphNode, IGraphRepository } from '../IGraphRepository';

export class JsonGraphRepository implements IGraphRepository {
    private config: Config;
    private baseDir: string;
    
    private vectorIndices: Map<string, LocalIndex> = new Map();
    private nodeCaches: Map<string, Map<string, GraphNode>> = new Map();
    private edgeCaches: Map<string, Map<string, GraphEdge>> = new Map();

    constructor(config: Config, baseDir: string) {
        this.config = config;
        this.baseDir = baseDir;
    }

    private getSessionDir(sessionId: string): string {
        return join(this.baseDir, sessionId, this.config.storage.graph_dir);
    }

    private async ensureSessionLoaded(sessionId: string): Promise<void> {
        if (this.vectorIndices.has(sessionId)) return;

        const sessionDir = this.getSessionDir(sessionId);
        await mkdir(sessionDir, { recursive: true });

        // Initialize Vectra Index
        const index = new LocalIndex(sessionDir);
        if (!(await index.isIndexCreated())) {
            await index.createIndex();
        }
        this.vectorIndices.set(sessionId, index);

        // Load Nodes
        const nodesFile = join(sessionDir, this.config.storage.graph_nodes_file);
        const nodesMap = new Map<string, GraphNode>();
        try {
            const data = await readFile(nodesFile, 'utf-8');
            const nodes: GraphNode[] = JSON.parse(data);
            nodes.forEach(n => nodesMap.set(n.id, n));
        } catch (e) {
            // File not found or empty
        }
        this.nodeCaches.set(sessionId, nodesMap);

        // Load Edges
        const edgesFile = join(sessionDir, this.config.storage.graph_edges_file);
        const edgesMap = new Map<string, GraphEdge>();
        try {
            const data = await readFile(edgesFile, 'utf-8');
            const edges: GraphEdge[] = JSON.parse(data);
            edges.forEach(e => edgesMap.set(e.id, e));
        } catch (e) {
            // File not found or empty
        }
        this.edgeCaches.set(sessionId, edgesMap);
    }

    private async persistNodes(sessionId: string): Promise<void> {
        const nodesMap = this.nodeCaches.get(sessionId)!;
        const nodesFile = join(this.getSessionDir(sessionId), this.config.storage.graph_nodes_file);
        await writeFile(nodesFile, JSON.stringify(Array.from(nodesMap.values()), null, 2), 'utf-8');
    }

    private async persistEdges(sessionId: string): Promise<void> {
        const edgesMap = this.edgeCaches.get(sessionId)!;
        const edgesFile = join(this.getSessionDir(sessionId), this.config.storage.graph_edges_file);
        await writeFile(edgesFile, JSON.stringify(Array.from(edgesMap.values()), null, 2), 'utf-8');
    }

    // ==========================================
    // 1. 節點操作 (Node Operations)
    // ==========================================
    async addNode(sessionId: string, node: GraphNode): Promise<void> {
        await this.ensureSessionLoaded(sessionId);
        
        // 1. Save to Node Cache
        this.nodeCaches.get(sessionId)!.set(node.id, node);
        await this.persistNodes(sessionId);

        // 2. Save to Vectra if embedding exists
        if (node.embedding && node.embedding.length > 0) {
            const index = this.vectorIndices.get(sessionId)!;
            await index.beginUpdate();
            await index.upsertItem({
                id: node.id,
                vector: node.embedding,
                metadata: { label: node.label }
            });
            await index.endUpdate();
        }
    }

    async updateNode(sessionId: string, node: GraphNode): Promise<void> {
        await this.addNode(sessionId, node); // UPSERT logic is the same
    }

    async getNode(sessionId: string, id: string): Promise<GraphNode | null> {
        await this.ensureSessionLoaded(sessionId);
        return this.nodeCaches.get(sessionId)!.get(id) || null;
    }

    async deleteNode(sessionId: string, id: string): Promise<void> {
        await this.ensureSessionLoaded(sessionId);
        
        // 1. Delete from Node Cache
        const nodesMap = this.nodeCaches.get(sessionId)!;
        if (nodesMap.has(id)) {
            nodesMap.delete(id);
            await this.persistNodes(sessionId);
        }

        // 2. Delete from Vectra
        const index = this.vectorIndices.get(sessionId)!;
        await index.beginUpdate();
        // NOTE: Vectra's deleteItem requires the item ID.
        try {
            await index.deleteItem(id);
        } catch (e) {
            // Ignore if not in index
        }
        await index.endUpdate();

        // 3. Cascade Delete Edges (Cleanup)
        const edgesMap = this.edgeCaches.get(sessionId)!;
        let edgesChanged = false;
        for (const [edgeId, edge] of edgesMap.entries()) {
            if (edge.sourceId === id || edge.targetId === id) {
                edgesMap.delete(edgeId);
                edgesChanged = true;
            }
        }
        if (edgesChanged) {
            await this.persistEdges(sessionId);
        }
    }

    // ==========================================
    // 2. 邊操作 (Edge Operations)
    // ==========================================
    async addEdge(sessionId: string, edge: GraphEdge): Promise<void> {
        await this.ensureSessionLoaded(sessionId);
        this.edgeCaches.get(sessionId)!.set(edge.id, edge);
        await this.persistEdges(sessionId);
    }

    async updateEdge(sessionId: string, edge: GraphEdge): Promise<void> {
        await this.addEdge(sessionId, edge);
    }

    async getEdge(sessionId: string, id: string): Promise<GraphEdge | null> {
        await this.ensureSessionLoaded(sessionId);
        return this.edgeCaches.get(sessionId)!.get(id) || null;
    }

    async getEdgesBySource(sessionId: string, sourceId: string): Promise<GraphEdge[]> {
        await this.ensureSessionLoaded(sessionId);
        const edgesMap = this.edgeCaches.get(sessionId)!;
        return Array.from(edgesMap.values()).filter(e => e.sourceId === sourceId);
    }

    async getEdgesByTarget(sessionId: string, targetId: string): Promise<GraphEdge[]> {
        await this.ensureSessionLoaded(sessionId);
        const edgesMap = this.edgeCaches.get(sessionId)!;
        return Array.from(edgesMap.values()).filter(e => e.targetId === targetId);
    }

    async deleteEdge(sessionId: string, id: string): Promise<void> {
        await this.ensureSessionLoaded(sessionId);
        const edgesMap = this.edgeCaches.get(sessionId)!;
        if (edgesMap.has(id)) {
            edgesMap.delete(id);
            await this.persistEdges(sessionId);
        }
    }

    // ==========================================
    // 3. 語意檢索與圖遍歷
    // ==========================================
    async searchNodesByVector(sessionId: string, vector: number[], topK: number = 5): Promise<GraphNode[]> {
        await this.ensureSessionLoaded(sessionId);
        const index = this.vectorIndices.get(sessionId)!;
        // vectra queryItems 參數: (vector, query_string, topK)
        const results = await index.queryItems(vector, "", topK);
        
        const nodesMap = this.nodeCaches.get(sessionId)!;
        const foundNodes: GraphNode[] = [];
        
        for (const result of results) {
            const node = nodesMap.get(result.item.id);
            if (node) {
                foundNodes.push(node);
            }
        }
        return foundNodes;
    }

    async getSubgraph(sessionId: string, centerNodeId: string, depth: number = 1): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; }> {
        await this.ensureSessionLoaded(sessionId);
        const nodesMap = this.nodeCaches.get(sessionId)!;
        const edgesMap = this.edgeCaches.get(sessionId)!;

        const visitedNodes = new Set<string>();
        const visitedEdges = new Set<string>();
        
        let currentLevel = new Set<string>([centerNodeId]);

        for (let i = 0; i < depth; i++) {
            const nextLevel = new Set<string>();
            
            for (const nodeId of currentLevel) {
                visitedNodes.add(nodeId);
                
                // 找出所有與該 Node 相連的 Edge (不論方向)
                for (const [edgeId, edge] of edgesMap.entries()) {
                    if (edge.sourceId === nodeId) {
                        visitedEdges.add(edgeId);
                        if (!visitedNodes.has(edge.targetId)) nextLevel.add(edge.targetId);
                    } else if (edge.targetId === nodeId) {
                        visitedEdges.add(edgeId);
                        if (!visitedNodes.has(edge.sourceId)) nextLevel.add(edge.sourceId);
                    }
                }
            }
            currentLevel = nextLevel;
        }

        // 把最後一層探索到的 Node 也加進去
        for (const nodeId of currentLevel) {
            visitedNodes.add(nodeId);
        }

        const nodes = Array.from(visitedNodes).map(id => nodesMap.get(id)).filter(n => n !== undefined) as GraphNode[];
        const edges = Array.from(visitedEdges).map(id => edgesMap.get(id)).filter(e => e !== undefined) as GraphEdge[];

        return { nodes, edges };
    }
}
