# 貢獻指南 (Contributing to SuperNova)

歡迎來到 SuperNova！我們非常高興您有興趣為本專案做出貢獻。在您開始撰寫程式碼之前，請務必仔細閱讀以下規範，這將有助於我們保持專案的高品質與一致性。

## 1. 認知先行 (Architecture First)
在進行任何代碼實作前，請務必：
- 仔細閱讀並理解 `docs/ARCH.md`。
- 查閱 `docs/architecture/` 目錄下的相關文件。
- 確保您清楚了解全局架構圖與目前系統設計。

## 2. 嚴格型別 (Strict Typing)
我們極度重視型別安全：
- 請盡可能避免使用 `optional()`。
- 強制使用嚴格的 Zod Schemas（Strict Zod schemas）來進行資料驗證與型別定義。

## 3. 系統通訊 (Event-Driven Communication)
SuperNova 採用事件驅動架構：
- **必須**使用 `EventBus` 進行所有代理（Agent）之間的通訊。
- **絕對禁止**使用直接的阻塞式方法呼叫（direct blocking method calls）來進行代理間的溝通。

## 4. 程式碼與註解規範 (Coding & Commenting Style)
為了讓全球開發者與本地團隊都能順暢協作，我們採取雙語混合規範：
- **命名規範：** 所有的變數、函數、資料結構與類別名稱**必須**使用英文，並遵循專案既有的 CamelCase 或 snake_case 風格。
- **註解規範：** 所有的程式碼註解（Comments）**必須**使用繁體中文 (zh-TW)。註解需詳細說明邏輯意圖、邊界情況及潛在風險，自成一體。

## 5. 測試與程式碼審查 (Testing & Linting)
在提交 (Commit) 您的程式碼之前，請確保通過所有檢查：
- 執行 `bun test` 來進行測試，並確保所有測試皆通過。
- 執行 `bun run lint` 來進行程式碼風格檢查。

再次感謝您對 SuperNova 的貢獻！如果您有任何問題，請隨時提出。
