import * as crypto from 'crypto';

export class IdGenerator {
  private static generate(prefix: string, useTimestamp: boolean = true): string {
    const randomHex = crypto.randomBytes(3).toString('hex'); // 6 chars
    if (useTimestamp) {
      const timestamp = Math.floor(Date.now() / 1000).toString(); // 秒級時間戳
      return `${prefix}${timestamp}_${randomHex}`;
    }
    return `${prefix}${randomHex}`;
  }

  // --- Workflow & Tracing ---
  static session(): string { return this.generate('session_', true); }
  static trace(): string { return this.generate('trace_', true); }
  static task(): string { return this.generate('task_', false); } // 任務數量多，可省略時間戳縮短長度
  
  /**
   * 生成 Span ID
   * @param role 發起動作的 Agent 角色縮寫 (sa, pa, da, ca, aa, sys, user)
   */
  static span(role: 'sa' | 'pa' | 'da' | 'ca' | 'aa' | 'sys' | 'user'): string {
    return this.generate(`span_${role}_`, false);
  }

  // --- Memory Entities ---
  /**
   * 生成 L2 Fact ID
   * @param scope 'session' 或 'global'
   */
  static fact(scope: 'session' | 'global'): string {
    const prefix = scope === 'session' ? 'memory_l2_session_' : 'memory_l2_global_';
    return this.generate(prefix, true);
  }
  
  /** 生成 L3 SOP ID */
  static sop(): string { return this.generate('memory_l3_', true); }

  /** 生成 Pointer ID (用於 L1 黑板指針) */
  static pointer(): string { return this.generate('memory_l1_', true); }

  /** 生成 TaskGraph ID */
  static graph(): string { return this.generate('task_graph_', true); }
}
