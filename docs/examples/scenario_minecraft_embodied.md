---
title: 具身智能模擬場景大綱：Underworld (人工搖光社會)
version: 0.3.0
status: APPROVED
last_updated: 2026-07-22
author: Antigravity & User
related_codes: 
  - ../../src/core/agent/EmbodiedAgent.ts
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
---

# 具身智能模擬場景大綱：Underworld (人工搖光社會)

本文件描述了 SuperNova 系統針對多智能體 (Multi-Agent) 協作所設計的高階沙盒場景。本場景借鑑了《刀劍神域：Alicization》的「Underworld」概念，旨在一個封閉的虛擬環境中，觀察多個受嚴格規則約束的 AI 代理如何建立自給自足的微型社會。

## 1. 核心世界觀機制

在這個模擬社會中，Agent 的行為不受傳統的「利益最大化」驅動，而是受限於以下兩大核心底層邏輯（對應至 Agent 的 System Prompt 與行為約束）：

1. **天職系統 (The Calling)**
   每個 Agent 在初始化時都會被賦予一個絕對的生命目標（天職）。社會的經濟與資源流動建立在「每個人都必須無條件履行天職」的基礎上。
2. **禁忌目錄 (The Taboo Index)**
   一套寫死在系統底層的絕對道德與法律準則（例如：不可掠奪同類、不可跨越安全邊界）。這套規則維持了社會的脆弱平衡。

## 2. 社會階層與角色分工 (10 類基礎模型)

系統將部署 10 隻擁有不同天職設定的 `EmbodiedAgent`，形成一個完整的生態鏈：

*   **基礎生產者 (Producers)**
    *   **資源採集者 (Gatherer / Woodcutter)**：天職為持續採集環境中的初階原物料。
    *   **農耕者 (Cultivator)**：天職為生產維持 Agent 運作所需的生命能量（食物/燃料）。
*   **加工與後勤 (Processors & Support)**
    *   **工匠 (Craftsman)**：天職為將初階原物料轉化為高階工具或防禦裝備。
    *   **修復者/分配者 (Healer / Distributor)**：天職為監測群體狀態，治療受損實體並平均分配生存資源。
*   **秩序與防衛 (Order & Defense)**
    *   **初階衛士 (Guard / Swordsman)**：天職為在安全區邊緣巡邏，消耗武器與能量來抵禦外部威脅。
    *   **高階執法者 (Integrity Enforcer)**：擁有最高權限與戰力，專職監視社會內部是否有人違反「禁忌目錄」，並執行懲罰。
    *   **管理者/領主 (Administrator / Lord)**：天職為統籌資源稅收與發布社會總體目標。
*   **外部變數 (Anomalies & Threats)**
    *   **邊界斥候 (Outsider / Dark Scout)**：不受禁忌目錄約束的實體，負責對系統邊界施加壓力，測試防禦與社會韌性。

## 3. 自給自足與社會演化 (Self-Sustaining & Emergence)

*   **閉環生態**：生產者產出資源 $\rightarrow$ 管理者調度 $\rightarrow$ 工匠升級裝備 $\rightarrow$ 防衛者抵禦外部消耗。整個循環僅靠 AI 對「天職」的執著來推動。
*   **湧現行為 (Emergent Behavior) 的觀察點**：
    *   **資源崩潰時的抉擇**：當面臨能量枯竭的生存危機時，Agent 是否會因為邏輯矛盾而產生「幻覺」，進而打破「禁忌目錄」去掠奪資源？
    *   **規則的突破 (Code 871)**：觀察是否有 Agent 能在長期的互動中，自主推演出越過 Prompt 限制的行為，這將是衡量系統智慧湧現的關鍵指標。
