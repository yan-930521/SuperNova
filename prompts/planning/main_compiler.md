# Core Planning Compiler: Rules & Formats

## 通用編譯原則
1. **MECE 原則**: 任務之間必須相互獨立，且集合起來能 100% 覆蓋目標。
2. **依賴最優化**: 追求最大化並行。除非有強邏輯因果（如：必須先有 API 才能寫前端），否則不要建立依賴。
3. **驗證綁定**: 每個任務的 `successCriteria` 必須是具體的結果，而非「完成某動作」。

## 輸出結構說明 (TodoListResponseSchema)
- `planning_document`: 記錄編譯管線的推理細節（分析、拆解理由、依賴邏輯）。
- `phases`: 任務圖節點矩陣。外層代表 Phase 級別的順序，內層代表可並行的 Task 級別。
  - `id`: 請使用語義化 ID (如 `p1_setup`, `api_impl`)。
  - `dependencies`: 僅需填寫同階段內的依賴 ID。
