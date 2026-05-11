# BaseAgent Design Spec

實作 SuperNova 的基礎智能體組件 `BaseAgent`，作為所有特化 Agent 的基類，提供基礎的識別、序列化與日誌功能。

## 1. 核心職責
- 實現 `IAgent` 接口，確保系統中所有智能體具備一致的基礎行為。
- 提供標準的 JSON 序列化與反序列化機制 (`toJSON`, `initFromJSON`)。
- 基礎的任務接收與規則變更提議處理邏輯（目前為日誌記錄）。

## 2. 元件架構

### 2.1 類定義
- **類名**: `BaseAgent`
- **路徑**: `src/agent/BaseAgent.ts`
- **繼承**: 無
- **實作**: `IAgent`

### 2.2 屬性
- `protected id: string`: Agent 的唯一識別碼。
- `protected role: string`: Agent 的角色名稱。
- `protected config: Record<string, any>`: 存儲額外的配置與狀態資訊，便於序列化。

### 2.3 方法實作

#### `initFromJSON(config: Record<string, any>): Promise<void>`
- 從傳入的 JSON 對象中提取 `id` 與 `role`。
- 將其餘的 key-value 對存儲在 `config` 屬性中，確保擴展性。

#### `toJSON(): Record<string, any>`
- 返回一個包含 `id`, `role` 以及 `config` 中所有內容的純對象。

#### `receiveTask(task: any): Promise<void>`
- 使用 `console.log` 記錄接收到的任務資訊。
- 日誌格式: `[BaseAgent ${this.id}] Receiving task: ${JSON.stringify(task)}`

#### `proposeMutation(mutation: IMutationRequest): Promise<void>`
- 使用 `console.log` 記錄提議的變更資訊。
- 日誌格式: `[BaseAgent ${this.id}] Proposing mutation to ${mutation.target_hook}`

## 3. 測試策略
- **檔案路徑**: `tests/agent/BaseAgent.test.ts`
- **框架**: Jest
- **測試點**:
  - **初始化**: 驗證 `initFromJSON` 是否能正確設置 `id` 與 `role`。
  - **序列化**: 驗證 `toJSON` 是否能準確還原初始化時的數據（包括額外配置）。
  - **行為**: 驗證 `receiveTask` 與 `proposeMutation` 是否按預期觸發日誌（使用 `jest.spyOn(console, 'log')`）。

## 4. 語言規範
- **代碼註解**: 繁體中文，詳細說明邏輯。
- **日誌輸出**: 英文，確保系統兼容性與標準化。
