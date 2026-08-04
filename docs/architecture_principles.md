---
title: 核心設計原則
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
related_codes:
  - ../src/core/infra/persistence/IRepository.ts
related_docs:
  - ./ARCH.md
---

# 核心設計原則 (Core Principles)

1. 資料的恢復與存取都只能透過IRepository介面，不得擅自通過檔案系統存取。
2. 測試文件一律位於bun的預設位置