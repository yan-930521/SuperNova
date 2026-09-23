import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { LocalIndex } from 'vectra';

import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { BaseJsonRepository } from '@supernova/storage';

import { DEFAULT_STORAGE_CONFIG, StorageConfig } from '../config';
import { GraphEdge, GraphNode, IGraphRepository, SubgraphResult } from './types';

/**
 * 節點 JSON 檔案持久化內部倉儲
 */
class NodeJsonRepository extends BaseJsonRepository<GraphNode[]> {
    constructor(baseDir: string, private readonly storage: StorageConfig) {
        super(baseDir);
    }

    protected getFilePath(sessionId: string): string {
        return join(
            this.baseDir,
            sessionId,
            this.storage.graph_dir,
            this.storage.graph_nodes_file
        );
    }

    public async load(sessionId: string): Promise<GraphNode[]> {
        return (await this.readJson(this.getFilePath(sessionId))) || [];
    }

    public async save(sessionId: string, nodes: GraphNode[]): Promise<void> {
        await this.writeJson(this.getFilePath(sessionId), nodes);
    }
}

/**
 * 關聯邊 JSON 檔案持久化內部倉儲
 */
class EdgeJsonRepository extends BaseJsonRepository<GraphEdge[]> {
    constructor(baseDir: string, private readonly storage: StorageConfig) {
        super(baseDir);
    }

    protected getFilePath(sessionId: string): string {
        return join(
            this.baseDir,
            sessionId,
            this.storage.graph_dir,
            this.storage.graph_edges_file
        );
    }

    public async load(sessionId: string): Promise<GraphEdge[]> {
        return (await this.readJson(this.getFilePath(sessionId))) || [];
    }

    public async save(sessionId: string, edges: GraphEdge[]): Promise<void> {
        await this.writeJson(this.getFilePath(sessionId), edges);
    }
}

/**
 * JsonGraphRepository 配置選項
 */
export interface JsonGraphRepositoryOptions {
    /** 儲存設定規格 */
    storage?: StorageConfig;
    /** 覆寫基礎根目錄 (預設為 storage.base_dir + storage.session_dir) */
    baseDir?: string;
    /** 日誌記錄器實例 */
    logger?: LogManager;
}

/**
 * 知識圖譜與向量記憶檔案系統倉儲 (JsonGraphRepository)
 * 結合 BaseJsonRepository (節點與關聯邊 JSON) 與 Vectra (本地向量索引庫)
 * 負責實體三元組的持久化、向量相似檢索與子圖拓撲展開
 */
export class JsonGraphRepository implements IGraphRepository {
    private readonly storage: StorageConfig;
    private readonly baseDir: string;
    private readonly logger: LogManager;

    private readonly nodeRepo: NodeJsonRepository;
    private readonly edgeRepo: EdgeJsonRepository;

    /** 各 Session 專屬之 Vectra 向量索引快取 (sessionId -> LocalIndex) */
    private readonly vectorIndices = new Map<string, LocalIndex>();

    /** 各 Session 專屬之節點記憶體快取 (sessionId -> Map<nodeId, GraphNode>) */
    private readonly nodeCaches = new Map<string, Map<string, GraphNode>>();

    /** 各 Session 專屬之關聯邊記憶體快取 (sessionId -> Map<edgeId, GraphEdge>) */
    private readonly edgeCaches = new Map<string, Map<string, GraphEdge>>();

    constructor(options: JsonGraphRepositoryOptions = {}) {
        this.storage = options.storage ?? DEFAULT_STORAGE_CONFIG;

        let targetBaseDir: string;
        if (options.baseDir) {
            targetBaseDir = options.baseDir;
        } else {
            targetBaseDir = join(this.storage.base_dir, this.storage.session_dir);
        }

        this.baseDir = targetBaseDir;
        this.logger =
            options.logger ??
            new LogManager({ type: 'SYSTEM', name: 'JsonGraphRepository' }).addTransport(
                new ConsoleTransport('DEBUG')
            );

        this.nodeRepo = new NodeJsonRepository(this.baseDir, this.storage);
        this.edgeRepo = new EdgeJsonRepository(this.baseDir, this.storage);
    }

    private getSessionGraphDir(sessionId: string): string {
        return join(this.baseDir, sessionId, this.storage.graph_dir);
    }

    private async ensureSessionLoaded(sessionId: string): Promise<void> {
        if (this.vectorIndices.has(sessionId)) {
            return;
        }

        const graphDir = this.getSessionGraphDir(sessionId);
        await mkdir(graphDir, { recursive: true });

        // 1. 初始化 Vectra 本地向量索引庫 (置於 graph/index 目錄)
        const indexDir = join(graphDir, 'index');
        await mkdir(indexDir, { recursive: true });

        const index = new LocalIndex(indexDir);
        if (!(await index.isIndexCreated())) {
            await index.createIndex();
        }
        this.vectorIndices.set(sessionId, index);

        // 2. 載入實體節點 (Nodes)
        const nodesMap = new Map<string, GraphNode>();
        try {
            const nodes = await this.nodeRepo.load(sessionId);
            for (const n of nodes) {
                nodesMap.set(n.id, n);
            }
        } catch (err: any) {
            this.logger.debug(`No existing nodes for session [${sessionId}]: ${err.message}`);
        }
        this.nodeCaches.set(sessionId, nodesMap);

        // 3. 載入實體關聯邊 (Edges)
        const edgesMap = new Map<string, GraphEdge>();
        try {
            const edges = await this.edgeRepo.load(sessionId);
            for (const e of edges) {
                edgesMap.set(e.id, e);
            }
        } catch (err: any) {
            this.logger.debug(`No existing edges for session [${sessionId}]: ${err.message}`);
        }
        this.edgeCaches.set(sessionId, edgesMap);
    }

    private async persistNodes(sessionId: string): Promise<void> {
        const nodesMap = this.nodeCaches.get(sessionId);
        if (nodesMap) {
            await this.nodeRepo.save(sessionId, Array.from(nodesMap.values()));
        }
    }

    private async persistEdges(sessionId: string): Promise<void> {
        const edgesMap = this.edgeCaches.get(sessionId);
        if (edgesMap) {
            await this.edgeRepo.save(sessionId, Array.from(edgesMap.values()));
        }
    }

    // ─── 1. 節點操作 (Node Operations) ───

    public async addNode(sessionId: string, node: GraphNode): Promise<void> {
        await this.ensureSessionLoaded(sessionId);

        // 1. 若具有 Embedding 向量，優先寫入 Vectra 索引庫
        if (node.embedding && node.embedding.length > 0) {
            const index = this.vectorIndices.get(sessionId)!;
            await index.beginUpdate();
            await index.upsertItem({
                id: node.id,
                vector: node.embedding,
                metadata: { label: node.label, memory: node.memory },
            });
            await index.endUpdate();
        }

        // 2. 寫入節點快取並持久化至 JSON (移除龐大 embedding 節省硬碟體積)
        const { embedding, ...nodeToPersist } = node;
        this.nodeCaches.get(sessionId)!.set(nodeToPersist.id, nodeToPersist as GraphNode);
        await this.persistNodes(sessionId);
    }

    public async updateNode(sessionId: string, node: GraphNode): Promise<void> {
        await this.addNode(sessionId, node);
    }

    public async getNode(sessionId: string, id: string): Promise<GraphNode | null> {
        await this.ensureSessionLoaded(sessionId);
        return this.nodeCaches.get(sessionId)!.get(id) ?? null;
    }

    public async deleteNode(sessionId: string, id: string): Promise<void> {
        await this.ensureSessionLoaded(sessionId);

        // 1. 從節點快取移除並存檔
        const nodesMap = this.nodeCaches.get(sessionId)!;
        if (nodesMap.has(id)) {
            nodesMap.delete(id);
            await this.persistNodes(sessionId);
        }

        // 2. 從 Vectra 向量庫移除
        const index = this.vectorIndices.get(sessionId)!;
        await index.beginUpdate();
        try {
            await index.deleteItem(id);
        } catch {
            // 若不在向量庫中則略過
        }
        await index.endUpdate();

        // 3. 級聯清理關聯邊 (Cascade Delete Edges)
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

    public async listNodes(sessionId: string): Promise<GraphNode[]> {
        await this.ensureSessionLoaded(sessionId);
        return Array.from(this.nodeCaches.get(sessionId)!.values());
    }

    // ─── 2. 關係邊操作 (Edge Operations) ───

    public async addEdge(sessionId: string, edge: GraphEdge): Promise<void> {
        await this.ensureSessionLoaded(sessionId);
        this.edgeCaches.get(sessionId)!.set(edge.id, edge);
        await this.persistEdges(sessionId);
    }

    public async updateEdge(sessionId: string, edge: GraphEdge): Promise<void> {
        await this.addEdge(sessionId, edge);
    }

    public async getEdge(sessionId: string, id: string): Promise<GraphEdge | null> {
        await this.ensureSessionLoaded(sessionId);
        return this.edgeCaches.get(sessionId)!.get(id) ?? null;
    }

    public async getEdgesBySource(sessionId: string, sourceId: string): Promise<GraphEdge[]> {
        await this.ensureSessionLoaded(sessionId);
        const edgesMap = this.edgeCaches.get(sessionId)!;
        return Array.from(edgesMap.values()).filter((e) => e.sourceId === sourceId);
    }

    public async getEdgesByTarget(sessionId: string, targetId: string): Promise<GraphEdge[]> {
        await this.ensureSessionLoaded(sessionId);
        const edgesMap = this.edgeCaches.get(sessionId)!;
        return Array.from(edgesMap.values()).filter((e) => e.targetId === targetId);
    }

    public async deleteEdge(sessionId: string, id: string): Promise<void> {
        await this.ensureSessionLoaded(sessionId);
        const edgesMap = this.edgeCaches.get(sessionId)!;
        if (edgesMap.has(id)) {
            edgesMap.delete(id);
            await this.persistEdges(sessionId);
        }
    }

    public async listEdges(sessionId: string): Promise<GraphEdge[]> {
        await this.ensureSessionLoaded(sessionId);
        return Array.from(this.edgeCaches.get(sessionId)!.values());
    }

    // ─── 3. 語意檢索與圖遍歷 ───

    public async searchNodesByVector(
        sessionId: string,
        vector: number[],
        topK: number = 5
    ): Promise<GraphNode[]> {
        await this.ensureSessionLoaded(sessionId);
        const index = this.vectorIndices.get(sessionId)!;
        // vectra queryItems 參數: (vector, query_string, topK)
        const results = await index.queryItems(vector, '', topK);

        const nodesMap = this.nodeCaches.get(sessionId)!;
        const foundNodes: GraphNode[] = [];

        for (const res of results) {
            const node = nodesMap.get(res.item.id);
            if (node) {
                foundNodes.push(node);
            }
        }
        return foundNodes;
    }

    public async getSubgraph(
        sessionId: string,
        centerNodeId: string,
        depth: number = 1
    ): Promise<SubgraphResult> {
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
                        if (!visitedNodes.has(edge.targetId)) {
                            nextLevel.add(edge.targetId);
                        }
                    } else if (edge.targetId === nodeId) {
                        visitedEdges.add(edgeId);
                        if (!visitedNodes.has(edge.sourceId)) {
                            nextLevel.add(edge.sourceId);
                        }
                    }
                }
            }
            currentLevel = nextLevel;
        }

        // 把最後一層探索到的 Node 也加進去
        for (const nodeId of currentLevel) {
            visitedNodes.add(nodeId);
        }

        const nodes = Array.from(visitedNodes)
            .map((id) => nodesMap.get(id))
            .filter((n): n is GraphNode => n !== undefined);

        const edges = Array.from(visitedEdges)
            .map((id) => edgesMap.get(id))
            .filter((e): e is GraphEdge => e !== undefined);

        return { nodes, edges };
    }

    public async searchGraphContext(
        sessionId: string,
        vector: number[],
        topK: number = 5,
        depth: number = 1
    ): Promise<SubgraphResult> {
        // 先找出 TopK 相關的最核心節點
        const rootNodes = await this.searchNodesByVector(sessionId, vector, topK);

        const allNodes = new Map<string, GraphNode>();
        const allEdges = new Map<string, GraphEdge>();

        // 將每一個核心節點作為起點，向外擴展 depth 層的 subgraph
        for (const root of rootNodes) {
            const subgraph = await this.getSubgraph(sessionId, root.id, depth);
            for (const n of subgraph.nodes) {
                allNodes.set(n.id, n);
            }
            for (const e of subgraph.edges) {
                allEdges.set(e.id, e);
            }
        }

        return {
            nodes: Array.from(allNodes.values()),
            edges: Array.from(allEdges.values()),
        };
    }
}
