
/**
 * SuperNova 全局 ID 生成器
 * 提供帶有語義前綴 (Semantic Prefix) 的 ID，大幅增加 Log 追蹤與 Oplog 除錯的辨識度。
 */
export class IdGenerator {
  /**
   * 基礎生成邏輯
   * @param prefix 前綴 (例如: 'block_')
   * @param useTimestamp 是否加入時間戳 (適用於生命週期較長的實體)
   */
  private static generate(prefix: string, useTimestamp: boolean = false): string {
    // 改用 Math.random 產生隨機 8 碼 hex，大幅降低原本 crypto.randomBytes 的 CPU 負擔
    const randomHex = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
    if (useTimestamp) {
      const timestamp = Math.floor(Date.now() / 1000).toString(16); // Hex timestamp
      return `${prefix}${timestamp}_${randomHex}`;
    }
    return `${prefix}${randomHex}`;
  }

  /**
   * 生成 DataBlock ID 
   * (高頻建立，使用純隨機以節省長度，例如: block_a1b2c3d4)
   */
  static dataBlock(): string { 
    return this.generate('block_'); 
  }

  /**
   * 生成 Agent 實體 ID
   * @param type Agent 的型態
   */
  static agent(type: 'main' | 'sub' | 'embodied'): string { 
    return this.generate(`agt_${type}_`, true); 
  }

  /**
   * 生成 Task ID
   */
  static task(): string { 
    return this.generate('task_', true); 
  }

  /**
   * 生成 Worker 實體 ID
   */
  static worker(): string { 
    return this.generate('wkr_'); 
  }

  /**
   * 生成 Session ID
   */
  static session(): string {
    return this.generate('ssn_', true);
  }

  /**
   * 生成 Blob ID
   */
  static blob(): string {
    return this.generate('blob_');
  }
}
