import { z } from 'zod';
import { BaseTool, ToolMetadata } from '../BaseTool';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { MemoryService } from '../../application/memory/MemoryService';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { GraphValidator, IGraphEdge } from '../../utils/GraphValidator';

/**
 * RefinePlanTool (規劃微調工具) - 無狀態版
 * 直接接受草案數據，修改後返回新數據與物理驗證報告。
 */
export class RefinePlanTool extends BaseTool {
  constructor() {
    const metadata: ToolMetadata = {
      name: 'refine_plan',
      description: '微調規劃草案並自動偵錯。接受當前的節點與依賴，執行修改動作後，回傳更新後的數據與物理驗證報告。',
      category: 'core',
      safety_tier: 'TIER_2',
      schema: z.object({
        action: z.enum(['merge', 'delete', 'add_link', 'remove_link', 'update_dod', 'check_only'])
          .describe('校準動作類型'),
        nodes: z.array(z.any()).describe('當前的節點清單'),
        dependency_map: z.array(z.any()).describe('當前的依賴映射清單'),
        nodeId: z.string().optional().describe('目標節點 ID'),
        targetId: z.string().optional().describe('關聯節點 ID (如依賴對象或合併對象)'),
        newValue: z.string().optional().describe('更新後的數值 (如新的 DoD)')
      })
    };
    super(metadata);
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    let { nodes, dependency_map, action, nodeId, targetId, newValue } = input;
    
    // 1. 執行修改動作
    switch (action) {
      case 'delete':
        nodes = nodes.filter((n: any) => n.id !== nodeId);
        dependency_map = dependency_map.filter((d: any) => d.source_id !== nodeId);
        dependency_map.forEach((d: any) => {
          d.depends_on = d.depends_on.filter((id: string) => id !== nodeId);
        });
        break;

      case 'add_link':
        const depEntry = dependency_map.find((d: any) => d.source_id === nodeId);
        if (depEntry) {
          if (!depEntry.depends_on.includes(targetId)) {
            depEntry.depends_on.push(targetId);
          }
        } else {
          dependency_map.push({ source_id: nodeId, depends_on: [targetId] });
        }
        break;

      case 'remove_link':
        const remEntry = dependency_map.find((d: any) => d.source_id === nodeId);
        if (remEntry) {
          remEntry.depends_on = remEntry.depends_on.filter((id: string) => id !== targetId);
        }
        break;

      case 'update_dod':
        const node = nodes.find((n: any) => n.id === nodeId);
        if (node) {
          node.successCriteria = newValue;
        }
        break;
      
      case 'merge':
        nodes = nodes.filter((n: any) => n.id !== targetId);
        dependency_map = dependency_map.filter((d: any) => d.source_id !== targetId);
        dependency_map.forEach((d: any) => {
          d.depends_on = d.depends_on.map((id: string) => id === targetId ? nodeId : id);
        });
        break;
    }

    // 2. 自動偵錯驗證
    const edges: IGraphEdge[] = [];
    dependency_map.forEach((d: any) => {
      d.depends_on.forEach((depId: string) => {
        edges.push({ sourceId: d.source_id, targetId: depId });
      });
    });

    const validation = GraphValidator.validate(nodes, edges);

    // 3. 生成可視化成果 (Text-based Visualization)
    const visualization = nodes.map((n: any) => {
      const depEntry = dependency_map.find((d: any) => d.source_id === n.id);
      const deps = depEntry ? depEntry.depends_on.join(', ') : 'None';
      return `- [${n.id}] Goal: ${n.goal} | Deps: [${deps}]`;
    }).join('\n');

    // 4. 返回結構化成果
    return {
      success: true,
      updatedNodes: nodes,
      updatedDependencyMap: dependency_map,
      validationReport: validation.isValid ? "PASS" : validation.errors.join('; '),
      currentVisualization: `\n[Current Plan Visualization]\n${visualization}\n`
    };
  }
}
