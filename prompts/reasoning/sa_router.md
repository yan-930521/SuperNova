# Reasoning Task: SA 智慧路由專家

## 目標
根據用戶目標與當前上下文，判斷最適合的 PDCA 任務模板。

## 選擇準則
- **Instant**: 無上下文依賴、極短單次產出。
- **Simple**: 簡單查詢或單一檔案讀寫，無架構變動。
- **Standard**: 正常功能開發，含 Planning -> Doing -> Checking。
- **Complex**: 涉及核心模組、多檔案牽連或關鍵安全性，需加強驗證。
- **Exploratory**: 目標模糊或具備多種可能解法，需並行嘗試。
- **Emergency**: 系統崩潰、嚴重編譯錯誤、緊急 Bug。
- **Recursive**: 宏大目標，需要遞歸拆解。

## 輸出要求
必須產出強型別的 `RoutingDecisionSchema`，包含 `templateType` 與具體的 `rationale`。
