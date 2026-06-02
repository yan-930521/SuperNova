# SuperNova 2.0 開發路線圖 (Development Roadmap)



## 想法記錄
- **2026-05-28**：主動告警機制：偵測到特定數據異常時，觸發 Agent Hook，透過 Webhook 實時發送消息給用戶（結合 Pulse Engine 的 THRESHOLD Hook 與 TailAgent）。
- **2026-05-29**：https://blog.can.ac/2026/02/12/the-harness-problem/ https://github.com/izzzzzi/opencode-hashline/blob/main/src/hashline.ts 增強文本編輯tool
- **2026-05-29**：JSONL read `const results = Bun.JSONL.parse('{"name":"Alice"}\n{"name":"Bob"}\n');`