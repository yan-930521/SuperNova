---
title: 檔案系統持久化架構與目錄規範 (File System Storage)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 檔案系統持久化架構與目錄規範 (File System Storage)

本文件詳細定義 SuperNova 在本地檔案系統中組織、命名與持久化各類資料的目錄層級規範與檔案格式標準。

---

## 1. 全局目錄樹狀拓撲

```
workspace/ (或由 storage.base_dir 配置之路徑)
├── sessions/                                       # 會話子系統持久化目錄
│   ├── sess_1001.json                              # 會話元數據 (狀態、成員、未消費收件箱)
│   ├── sess_1001/                                  # 該會話之關聯大資料與歷史
│   │   ├── agents/
│   │   │   ├── xiamo/
│   │   │   │   └── history.jsonl                   # 該 Agent 的專屬歷史對話軌跡 (JSONL)
│   │   │   └── worker_1/
│   │   │       └── history.jsonl
│   │   └── blobs/                                  # 兩段式卸載之大型負載文字檔
│   │       ├── blob_abc123.txt                     # 原始大型 Payload 內容
│   │       └── blob_def456.txt
│   └── sess_1002.json
│
├── memory/                                         # 長期記憶持久化目錄
│   ├── graph_entities.json                         # 知識圖譜實體庫
│   ├── graph_relations.json                        # 知識圖譜三元組關係庫
│   └── daily_summaries/                            # 每日情節總結存放目錄
│       ├── 2026-09-21.md
│       └── 2026-09-23.md
│
└── profiles/                                       # 代理人人設配置目錄
    ├── self/
    │   └── main_agent.json                         # 主意識 (夏沫) 人設規格
    └── workers/
        └── code_reviewer.json
```

---

## 2. 格式選型與工程依據

| 資料類別 | 採納檔案格式 | 選型技術依據 |
| :--- | :---: | :--- |
| **會話元數據 (Session Data)** | **JSON** | 具備嚴格的階層樹結構，支援以單一物件原子化讀寫與重啟復原。 |
| **對話歷史軌跡 (History)** | **JSONL** | 每行一筆完整的 `DataBlockData`。支援以 O(1) 時間複雜度快速追加 (`append`)，單行損毀不破壞全局檔案。 |
| **大資料卸載 (Blobs)** | **TXT** | 儲存圖片 Base64、巨量原始碼或長篇文件，以 URI 指標解耦訊息本體。 |
| **情節記憶 (Daily Summaries)** | **Markdown** | 人類易讀易編輯，且可直接無縫注入至 LLM 系統提示詞中。 |
