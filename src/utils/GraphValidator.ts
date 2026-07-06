/**
 * GraphValidator (圖形驗證器)
 * 提供純函數邏輯，用於偵測任務圖或規劃草案中的物理邏輯錯誤。
 */

export interface IGraphNode {
  id: string;
  [key: string]: any;
}

export interface IGraphEdge {
  sourceId: string;
  targetId: string;
}

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  cycles: string[][];
  danglingEdges: IGraphEdge[];
  orphans: string[];
}

export class GraphValidator {
  /**
   * 執行完整驗證
   * @param nodes 節點清單
   * @param edges 邊清單 (sourceId -> depends on -> targetId) 
   *              注意：這裡的 sourceId 是依賴者，targetId 是被依賴者
   */
  public static validate(nodes: IGraphNode[], edges: IGraphEdge[]): ValidationReport {
    const errors: string[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));
    const danglingEdges: IGraphEdge[] = [];
    
    // 1. 檢查 ID 唯一性
    if (nodeIds.size !== nodes.length) {
      errors.push("發現重複的節點 ID。");
    }

    // 2. 檢查孤立邊 (Dangling Edges)
    const validEdges: IGraphEdge[] = [];
    for (const edge of edges) {
      let isDangling = false;
      if (!nodeIds.has(edge.sourceId)) {
        errors.push(`邊的源節點不存在: ${edge.sourceId}`);
        isDangling = true;
      }
      if (!nodeIds.has(edge.targetId)) {
        errors.push(`邊的目標節點 (依賴項) 不存在: ${edge.targetId}`);
        isDangling = true;
      }
      
      if (isDangling) {
        danglingEdges.push(edge);
      } else {
        validEdges.push(edge);
      }
    }

    // 3. 循環依賴檢查 (Kahn's Algorithm)
    const cycles = this.detectCycles(nodes, validEdges);
    if (cycles.length > 0) {
      cycles.forEach(cycle => {
        errors.push(`發現循環依賴: ${cycle.join(' -> ')}`);
      });
    }

    // 4. 檢查孤兒節點 (Orphans - 既無依賴也沒被依賴，且不是唯一節點)
    const orphans: string[] = [];
    if (nodes.length > 1) {
      const activeNodes = new Set<string>();
      validEdges.forEach(e => {
        activeNodes.add(e.sourceId);
        activeNodes.add(e.targetId);
      });
      nodes.forEach(n => {
        if (!activeNodes.has(n.id)) {
          orphans.push(n.id);
          errors.push(`發現孤立任務 (無任何依賴關係): ${n.id}`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      cycles,
      danglingEdges,
      orphans
    };
  }

  /**
   * 使用 Kahn's Algorithm 偵測循環
   */
  private static detectCycles(nodes: IGraphNode[], edges: IGraphEdge[]): string[][] {
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    nodes.forEach(n => {
      adj.set(n.id, []);
      inDegree.set(n.id, 0);
    });

    edges.forEach(e => {
      // e.targetId 是被依賴者 (先執行)，e.sourceId 是依賴者 (後執行)
      // 在拓撲排序中，邊應該是 targetId -> sourceId
      adj.get(e.targetId)?.push(e.sourceId);
      inDegree.set(e.sourceId, (inDegree.get(e.sourceId) || 0) + 1);
    });

    const queue: string[] = [];
    inDegree.forEach((degree, id) => {
      if (degree === 0) queue.push(id);
    });

    let count = 0;
    const sorted: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      sorted.push(u);
      count++;
      
      adj.get(u)?.forEach(v => {
        const d = inDegree.get(v)! - 1;
        inDegree.set(v, d);
        if (d === 0) queue.push(v);
      });
    }

    if (count < nodes.length) {
      // 簡單回傳代表性的循環路徑 (實際情況可能有多個，這裡做簡化處理)
      const remainingNodes = nodes.filter(n => !sorted.includes(n.id)).map(n => n.id);
      return [remainingNodes]; 
    }

    return [];
  }
}
