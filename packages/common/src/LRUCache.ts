/**
 * 泛型 LRU 快取機制 (LRU Cache)
 * 繼承自原生的 Map，保證完全相容既有 API，
 * 並在 set/get 時自動進行 O(1) 的存取順序更新與上限淘汰機制。
 */
export class LRUCache<K, V> extends Map<K, V> {
  private readonly timestamps = new Map<K, number>();

  constructor(
    private readonly maxKeys: number, 
    private readonly ttlMs?: number,
    private readonly onEvict?: (key: K, value: V) => void
  ) {
    super();
  }

  /**
   * 取得指定 key 的值，若命中則觸發 LRU 更新 (移至最後)
   * 若有設定 TTL 且已超時，則刪除並回傳 undefined
   */
  get(key: K): V | undefined {
    if (super.has(key)) {
      // 檢查 TTL
      if (this.ttlMs !== undefined) {
        const ts = this.timestamps.get(key);
        if (ts !== undefined && Date.now() - ts > this.ttlMs) {
          const v = super.get(key);
          this.delete(key);
          if (this.onEvict && v) this.onEvict(key, v);
          return undefined;
        }
      }

      const value = super.get(key)!;
      // 刪除並重新加入，使其在內部迭代順序中移至末端 (最新)
      super.delete(key);
      super.set(key, value);
      
      // 同步更新 timestamps 位置
      if (this.ttlMs !== undefined) {
        const ts = this.timestamps.get(key)!;
        this.timestamps.delete(key);
        this.timestamps.set(key, ts);
      }
      
      return value;
    }
    return undefined;
  }

  /**
   * 設定指定 key 的值，若超過數量上限則淘汰最舊的一筆
   */
  set(key: K, value: V): this {
    if (super.has(key)) {
      const oldV = super.get(key);
      super.delete(key);
      if (this.ttlMs !== undefined) this.timestamps.delete(key);
      if (this.onEvict && oldV) this.onEvict(key, oldV);
    }
    super.set(key, value);
    if (this.ttlMs !== undefined) this.timestamps.set(key, Date.now());

    // 當超出上限時，刪除 Map 中的第一個 (最舊的) key
    if (this.size > this.maxKeys) {
      const oldestKey = this.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestV = super.get(oldestKey);
        this.delete(oldestKey);
        if (this.onEvict && oldestV) this.onEvict(oldestKey, oldestV);
      }
    }
    return this;
  }

  /**
   * 刪除指定 key
   */
  delete(key: K): boolean {
    if (this.ttlMs !== undefined) this.timestamps.delete(key);
    // 這裡我們不自動觸發 onEvict，讓顯式 delete 的調用者自己處理，或由內部過期/覆蓋機制處理
    return super.delete(key);
  }

  /**
   * 清除所有快取
   */
  clear(): void {
    if (this.onEvict) {
        for (const [k, v] of this.entries()) {
            this.onEvict(k, v);
        }
    }
    if (this.ttlMs !== undefined) this.timestamps.clear();
    super.clear();
  }
}
