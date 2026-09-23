/**
 * 環境變數智慧解析與映射工具
 * 支援將帶有前綴的環境變數轉換為巢狀物件，並自動推導基礎資料型別
 */
export class EnvParser {
    /**
     * 解析環境變數為巢狀物件
     * 語法範例：
     * SUPERNOVA_LLM__DEFAULT_PRESET="gpt-4o" -> { llm: { default_preset: "gpt-4o" } }
     * SUPERNOVA_STORAGE__CACHE_SIZE="1000"   -> { storage: { cache_size: 1000 } }
     * SUPERNOVA_AGENT__ENABLE_PROJECTION="true" -> { agent: { enable_projection: true } }
     *
     * @param env 環境變數字典 (通常為 process.env)
     * @param prefix 比對的前綴 (預設 'SUPERNOVA_')
     */
    public static parse(
        env: Record<string, string | undefined> = process.env,
        prefix: string = 'SUPERNOVA_'
    ): Record<string, any> {
        const result: Record<string, any> = {};

        for (const [rawKey, rawValue] of Object.entries(env)) {
            if (!rawKey.startsWith(prefix) || rawValue === undefined) {
                continue;
            }

            // 移除前綴並轉小寫處理路徑
            const keyWithoutPrefix = rawKey.slice(prefix.length);
            // 以雙底線 __ 切割為巢狀階層路徑
            const pathParts = keyWithoutPrefix.split('__').map(part => part.toLowerCase());

            if (pathParts.length === 0 || pathParts[0] === '') {
                continue;
            }

            const parsedValue = this.coerceValue(rawValue);
            this.setDeepValue(result, pathParts, parsedValue);
        }

        return result;
    }

    /**
     * 智慧推導字串之真實型別 (boolean, number, json 或 string)
     */
    public static coerceValue(value: string): any {
        const trimmed = value.trim();

        // 1. 布林值解析
        if (trimmed.toLowerCase() === 'true') return true;
        if (trimmed.toLowerCase() === 'false') return false;

        // 2. 數值解析 (排除空字串與 NaN)
        if (trimmed !== '' && !isNaN(Number(trimmed))) {
            return Number(trimmed);
        }

        // 3. JSON 結構解析 (陣列或物件)
        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                return JSON.parse(trimmed);
            } catch {
                // 若解析失敗，降級為純字串
            }
        }

        return value;
    }

    /**
     * 依據路徑鍵值將數值遞迴設定進目標物件
     */
    private static setDeepValue(target: Record<string, any>, path: string[], value: any): void {
        let current = target;

        for (let i = 0; i < path.length - 1; i++) {
            const segment = path[i];
            if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
                current[segment] = {};
            }
            current = current[segment];
        }

        current[path[path.length - 1]] = value;
    }
}
