export interface StateEntry<T = any> {
    value: T;
    description: string;
}

export class StateRegistry {
    private readonly states = new Map<string, StateEntry>();

    /**
     * 註冊一個新的狀態變數，如果已經存在則會拋出錯誤
     * @param key 狀態變數名稱
     * @param initialValue 初始值
     * @param description 描述 (幫助 LLM 理解此狀態的意義)
     */
    public register<T>(key: string, initialValue: T, description: string): void {
        if (this.states.has(key)) {
            throw new Error(`State '${key}' is already registered.`);
        }
        this.states.set(key, { value: initialValue, description });
    }

    /**
     * 讀取狀態數值
     */
    public get<T = any>(key: string): T | undefined {
        const entry = this.states.get(key);
        return entry ? entry.value as T : undefined;
    }

    /**
     * 更新已存在的狀態數值
     * @param key 狀態變數名稱
     * @param newValue 新的數值
     */
    public update<T>(key: string, newValue: T): void {
        const entry = this.states.get(key);
        if (!entry) {
            throw new Error(`State '${key}' not found. You must register it first.`);
        }
        entry.value = newValue;
    }

    /**
     * 刪除特定狀態
     */
    public delete(key: string): void {
        this.states.delete(key);
    }

    /**
     * 匯出所有的狀態與描述，供 LLM 閱讀
     */
    public exportSummary(): string {
        if (this.states.size === 0) return 'No dynamic state currently registered.';
        
        let summary = 'Dynamic Agent States:\n';
        for (const [key, entry] of this.states.entries()) {
            summary += `- [${key}]: ${JSON.stringify(entry.value)} (Description: ${entry.description})\n`;
        }
        return summary;
    }

    /**
     * 序列化為純物件供持久化儲存
     */
    public serialize(): Record<string, StateEntry> {
        const data: Record<string, StateEntry> = {};
        for (const [key, entry] of this.states.entries()) {
            data[key] = entry;
        }
        return data;
    }

    /**
     * 從純物件還原狀態樹
     */
    public hydrate(data: Record<string, StateEntry>): void {
        this.states.clear();
        for (const [key, entry] of Object.entries(data)) {
            this.states.set(key, entry);
        }
    }
}
