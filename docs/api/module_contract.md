---
title: 代理器官模組開發契約指南 (Module Contract)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 代理器官模組開發契約指南 (Module Contract)

本文件定義在 SuperNova 系統中開發新器官模組 (`IAgentModule`) 時必須嚴格遵守的工程契約、命名空間標準與行為準則。

---

## 1. 優先級與命名矩陣 (Priority Matrix)

開發新模組時，必須根據其在認知管線中的語意位置分配合理的優先級 (`priority`)：

| 模組領域範疇 | 建議 Priority 區間 | 典型代表模組 |
| :--- | :---: | :--- |
| **身分與核心協議** | 1 ~ 9 | `ProfileModule` (5) |
| **會話上下文與歷史** | 10 ~ 19 | `HistoryModule` (10) |
| **長期記憶與知識庫** | 20 ~ 29 | `MemoryModule` (20) |
| **認知情緒與心理狀態** | 30 ~ 39 | `EmotionModule` (30) |
| **組織監督與目標規劃** | 40 ~ 49 | `PlannerModule` (40), `SupervisorModule` (40) |
| **意識投影與動態藉調** | 50 ~ 59 | `ProjectionModule` (50) |
| **具體任務與執行工作者**| 60 ~ 69 | `TaskWorkerModule` (60) |
| **實體具身與環境感知** | 70 ~ 79 | `EmbodimentModule` (70) |

---

## 2. 模組開發自我檢核清單 (Contract Checklist)

- [ ] **命名空間唯一**：`name` 使用全英文小寫蛇底線（例如 `custom_analytics`），禁止包含特殊符號。
- [ ] **無直接引用**：嚴禁直接引入其他具體模組實體，跨模組調用必須透過 `IAgentContext.getModule()` 或 `EventBus`。
- [ ] **嚴格相依性宣告**：若需要其他模組之功能，必須在 `requires` 中明確列出，由容器負責掛載期驗證。
- [ ] **生命週期清理**：在 `onDetach` 鉤子中必須取消所有在 `onAttach` 註冊的事件監聽器與計時器，杜絕記憶體洩漏。
- [ ] **提示詞索引遵從**：`getPromptSections()` 貢獻的段落必須嚴格採用標準 `PromptSectionIndex` 列舉，禁止傳入未定義的整數。
- [ ] **工具安全性與命名**：`getTools()` 提供的工具名稱採用動詞前綴（如 `read_file`, `send_alert`），並使用 Zod Schema 嚴格限制參數。
- [ ] **錯誤隔離**：在 `onBeforeStep` 與 `onAfterStep` 中的邏輯若發生異常，應進行局部捕捉並記錄日誌，防止單一器官異常摧毀整個代理人推理迴圈。
