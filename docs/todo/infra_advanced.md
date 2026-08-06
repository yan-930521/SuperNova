---
title: 基礎建設進階功能規劃
version: 0.1.0
status: DRAFT
last_updated: 2026-08-06
related_docs:
  - ../architecture/core/base.md
---

# 基礎建設進階功能規劃

> **[TODO]** 以下為系統基礎建設已規劃但尚未實現的進階元件與流程。

## 1. HITLGateway (人機協同審批閘道)
人機協同審批閘道，持久化管理審批請求。作為 Kernel 五大核心管理器之一，負責：
*   啟用對外人機交互監聯 (`start()`)
*   關閉對外審批端口，將所有 `PENDING` 狀態的審批請求安全封存 (`stop()`)

## 2. Telemetry 監控 (Metrics & Tracing)
完整的可觀測性系統，包含：
*   OpenTelemetry 或類似框架整合
*   Metrics 收集器（Agent 效能指標、EventBus 吞吐量）
*   Distributed Tracing（跨 Agent 的請求追蹤鏈路）

## 3. 外掛註冊機制 (Plugin Registry)
動態外掛掃描與載入機制，允許 Package 層透過 Registry 自動註冊與發現外掛模組，無需硬編碼引入。
