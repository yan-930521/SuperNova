# ReadFileTool Design Spec

## 1. Purpose
`ReadFileTool` 是一個原子化工具，用於讀取專案 Sandbox 範圍（專案根目錄與 `workspace` 目錄）內的檔案內容。

## 2. Architecture
- **繼承關係**：繼承自 `BaseFileTool`。
- **依賴**：
  - `fs/promises`：用於非同步讀取檔案。
  - `zod`：用於輸入參數驗證。
  - `path`：用於路徑處理。

## 3. Data Flow
1. **Input**：接收包含 `path` 字串的物件。
2. **Validation**：
   - 使用 Zod Schema 驗證輸入格式。
   - 使用 `BaseFileTool.validatePath(path, 'read')` 驗證路徑安全。
3. **Execution**：使用 `fs.promises.readFile` 讀取檔案內容。
4. **Output**：回傳檔案內容字串。

## 4. Input Schema
```typescript
{
  path: string; // 目標檔案的相對或絕對路徑
}
```

## 5. Error Handling
- **路徑不安全**：由 `validatePath` 拋出錯誤（如存取 `node_modules` 或 `.env`）。
- **檔案不存在**：`fs.promises.readFile` 會拋出原生錯誤，工具應允許其傳遞或封裝。
- **輸入格式錯誤**：由 `BaseTool.validateInput` 攔截。

## 6. Testing Strategy (TDD)
- **單元測試**：
  - 測試讀取 `workspace` 中的檔案。
  - 測試讀取專案根目錄中的檔案（如 `README.md`）。
  - 測試讀取不存在的檔案應拋出錯誤。
  - 測試讀取黑名單檔案應拋出路徑驗證錯誤。
