import * as fs from 'fs/promises';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { DEFAULT_STORAGE_CONFIG } from '../config';
import { GraphEdge, GraphNode, JsonGraphRepository } from '../memory';

describe('JsonGraphRepository (知識圖譜與向量記憶倉儲)', () => {
    const testBaseDir = './workspace_test_graph';
    const sessionId = 'test-graph-session';
    let repo: JsonGraphRepository;

    beforeEach(() => {
        repo = new JsonGraphRepository({
            storage: {
                ...DEFAULT_STORAGE_CONFIG,
                base_dir: testBaseDir,
                session_dir: 'sessions',
                graph_dir: 'graph',
                graph_nodes_file: 'nodes.json',
                graph_edges_file: 'edges.json',
            },
        });
    });

    afterEach(async () => {
        await fs.rm(testBaseDir, { recursive: true, force: true }).catch(() => {});
    });

    it('應能新增、讀取與更新實體節點 (Node Operations)', async () => {
        const node1: GraphNode = {
            id: 'USER:Yan',
            label: 'User',
            memory: 'Yan is the creator of SuperNova project, loves TypeScript and strict typing.',
            embedding: [0.1, 0.2, 0.3],
            properties: { role: 'Architect' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await repo.addNode(sessionId, node1);

        const fetched = await repo.getNode(sessionId, 'USER:Yan');
        expect(fetched).toBeDefined();
        expect(fetched?.id).toBe('USER:Yan');
        expect(fetched?.label).toBe('User');
        expect(fetched?.properties?.role).toBe('Architect');

        // 更新節點
        const updatedNode: GraphNode = {
            ...node1,
            properties: { role: 'Lead Architect' },
            updatedAt: Date.now(),
        };
        await repo.updateNode(sessionId, updatedNode);

        const fetchedAgain = await repo.getNode(sessionId, 'USER:Yan');
        expect(fetchedAgain?.properties?.role).toBe('Lead Architect');

        const allNodes = await repo.listNodes(sessionId);
        expect(allNodes.length).toBe(1);
    });

    it('應能新增、查詢與刪除關係邊 (Edge Operations)', async () => {
        const node1: GraphNode = {
            id: 'USER:Yan',
            label: 'User',
            memory: 'User Yan',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const node2: GraphNode = {
            id: 'PROJECT:SuperNova',
            label: 'Project',
            memory: 'Autonomous multi-agent runtime',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await repo.addNode(sessionId, node1);
        await repo.addNode(sessionId, node2);

        const edge: GraphEdge = {
            id: 'edge_01',
            sourceId: 'USER:Yan',
            targetId: 'PROJECT:SuperNova',
            relation: 'MAINTAINS',
            weight: 1.0,
            properties: { since: 2026 },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await repo.addEdge(sessionId, edge);

        const fetchedEdge = await repo.getEdge(sessionId, 'edge_01');
        expect(fetchedEdge).toBeDefined();
        expect(fetchedEdge?.relation).toBe('MAINTAINS');

        const sourceEdges = await repo.getEdgesBySource(sessionId, 'USER:Yan');
        expect(sourceEdges.length).toBe(1);
        expect(sourceEdges[0].targetId).toBe('PROJECT:SuperNova');

        const targetEdges = await repo.getEdgesByTarget(sessionId, 'PROJECT:SuperNova');
        expect(targetEdges.length).toBe(1);
        expect(targetEdges[0].sourceId).toBe('USER:Yan');
    });

    it('刪除節點時應能級聯清理相關的關係邊 (Cascade Delete)', async () => {
        await repo.addNode(sessionId, {
            id: 'NODE:A',
            label: 'Concept',
            memory: 'Concept A',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await repo.addNode(sessionId, {
            id: 'NODE:B',
            label: 'Concept',
            memory: 'Concept B',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        await repo.addEdge(sessionId, {
            id: 'edge_AB',
            sourceId: 'NODE:A',
            targetId: 'NODE:B',
            relation: 'CONNECTS',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        expect((await repo.listEdges(sessionId)).length).toBe(1);

        // 刪除 NODE:A，edge_AB 應被級聯清理
        await repo.deleteNode(sessionId, 'NODE:A');

        expect(await repo.getNode(sessionId, 'NODE:A')).toBeNull();
        expect(await repo.getEdge(sessionId, 'edge_AB')).toBeNull();
        expect((await repo.listEdges(sessionId)).length).toBe(0);
    });

    it('應能執行向量檢索與子圖拓撲展開 (Vector Search & Subgraph)', async () => {
        // 建立 3 個節點與向量
        await repo.addNode(sessionId, {
            id: 'A',
            label: 'Tech',
            memory: 'TypeScript programming',
            embedding: [1.0, 0.0, 0.0],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await repo.addNode(sessionId, {
            id: 'B',
            label: 'Framework',
            memory: 'LangChain integration',
            embedding: [0.0, 1.0, 0.0],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await repo.addNode(sessionId, {
            id: 'C',
            label: 'Runtime',
            memory: 'Bun fast runtime',
            embedding: [0.0, 0.0, 1.0],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        await repo.addEdge(sessionId, {
            id: 'e1',
            sourceId: 'A',
            targetId: 'B',
            relation: 'SUPPORTS',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await repo.addEdge(sessionId, {
            id: 'e2',
            sourceId: 'B',
            targetId: 'C',
            relation: 'RUNS_ON',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // 1. 向量搜尋接近 [1.0, 0.0, 0.0] 的節點
        const searchResults = await repo.searchNodesByVector(sessionId, [0.95, 0.05, 0.0], 1);
        expect(searchResults.length).toBe(1);
        expect(searchResults[0].id).toBe('A');

        // 2. 獲取深度為 1 的子圖 (A 的鄰居應有 B)
        const sub1 = await repo.getSubgraph(sessionId, 'A', 1);
        const nodeIds1 = sub1.nodes.map(n => n.id);
        expect(nodeIds1).toContain('A');
        expect(nodeIds1).toContain('B');
        expect(nodeIds1).not.toContain('C');

        // 3. 獲取深度為 2 的子圖 (應涵蓋 A, B, C)
        const sub2 = await repo.getSubgraph(sessionId, 'A', 2);
        const nodeIds2 = sub2.nodes.map(n => n.id);
        expect(nodeIds2).toContain('A');
        expect(nodeIds2).toContain('B');
        expect(nodeIds2).toContain('C');
        expect(sub2.edges.length).toBe(2);

        // 4. searchGraphContext 聯合查詢
        const contextGraph = await repo.searchGraphContext(sessionId, [0.95, 0.05, 0.0], 1, 1);
        expect(contextGraph.nodes.length).toBeGreaterThanOrEqual(2);
    });
});
