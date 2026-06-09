# SuperNova Project TODOs

## Agent Logic & PDCA
- [x] **Agent 引擎初始化重構**：將 LLM 引擎的載入邏輯收斂至 `BaseAgent.initEngine`，移除各子類的 `warmupEngine` 屎山代碼與預熱概念，並直接在構造函數中調用。（2026-06-09 完成）
- [x] **移除所有測試檔案**：因應策略變更，清理所有 `__tests__`、`tests` 與測試用目錄。（2026-06-09 完成）
- [x] **Recursive 模板記憶體管理**：討論子任務觸發 PDCA 時，L1 Blackboard 應該是「全局共享」還是「層級隔離」。（2026-06-09 決定採用全局共享黑板）
- [x] **Complex 模板的「完整驗證」具體細節**：定義相較於 Standard 模式，Complex 需要額外滿足的 QA 門檻：包含依賴性溯源 (Source Tracing, Hard Gate) 與反方辯證 (Red Teaming, Soft Gate)。（2026-06-09 完成）
