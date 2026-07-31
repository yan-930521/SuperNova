# SuperNova 系統文件規範 (Document Standards)

本文件定義了 SuperNova 專案中所有文件（Markdown）的目錄結構與格式標準。這有助於保持全系統設計規格的統一性，便於開發者與 AI 代理人（Agent）快速理解、索引並維持架構一致性。

---

## 1. 目錄結構規範 (Directory Layout)

為了保持目錄扁平化並與程式碼庫（`src/`）的邏輯邊界高度對齊，所有 `docs/` 下的文件必須嚴格歸類於以下結構中：

```text
docs/
├── ARCH.md                           # 全局架構入口與導讀點 (C4 Context/Container 級別)
├── architecture_principles.md        # 系統核心設計哲學與原則
├── doc_standards.md                  # 本文件 (系統文件規範)
│
├── architecture/                     # 正式系統架構與模組設計說明 (與 src/ 對應)
│   ├── core/                         # 基礎設施層 (EventBus, Memory, Session, Security, Base)
│
├── spec/                             # 系統規格與詳細設計說明書專區 (包含歷史與正在討論的 Spec)
│   └── YYYY-MM-DD-topic-design.md
│
└── examples/                         # 綜合模擬使用場景與資料流演練 (Scenario Walkthrough)
```

---

## 2. 格式規範 (Markdown Frontmatter)

所有位於 `docs/` 下的 `.md` 檔案，**必須在檔案最頂部包含統一格式的 YAML Frontmatter**。這為 AI 提供了不可或缺的 Metadata，以判斷規格的有效性與關聯代碼。

### 2.1. YAML 標頭欄位定義
*   `title` (String): 文件的中文標題。
*   `version` (String): 文件的版本號（語意化版本，例如 `1.0.0`）。
*   `status` (Enum): 當前設計的狀態。
    *   `DRAFT`: 草稿階段，代表該設計仍在與使用者進行「構想對齊」或討論中。
    *   `APPROVED`: 已核准，代表該設計已與使用者達成共識，屬於正式開發依據。
    *   `DEPRECATED`: 已過時，代表該設計已被更新的文檔或代碼取代，僅供歷史參考。
*   `last_updated` (String): 最後更新日期（格式：`YYYY-MM-DD`）。
*   `author` (String): 撰寫或修改文件的作者（如 `Antigravity & User`）。
*   `related_codes` (Array[String]): 此架構文件所直接關聯的**程式碼檔案相對路徑連結**。
*   `related_docs` (Array[String]): 與此文件緊密相關的其他**架構文件相對路徑連結**。

### 2.2. YAML 模板示例
```markdown
---
title: 任務系統規範
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes:
  - ../../src/core/task/Task.ts
related_docs:
  - ../architecture/core/memory.md
---
```

---

## 3. 目錄重構與遷移工作 (Migration & Action Items)

當此規範確立後，後續的文檔修改應逐步進行以下調整：
1.  **文件標頭補齊**：逐步為現存的所有 `docs/**/*.md` 文件補上 YAML Frontmatter。
2.  **目錄扁平化**：
    *   移除空目錄 `docs/architecture/examples/`。
3.  **全局架構更新**：更新 `docs/ARCH.md`，將所有文檔連結對齊至最新路徑。
