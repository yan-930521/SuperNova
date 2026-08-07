# 階段開發完成檢查清單 (Phase Completion Checklist)

> **Agent 系統提示 (System Prompt)**
> 當你判斷一個功能模組、一項重大重構，或是一個里程碑版本 (如 v0.1.0, v0.2.0) 已經開發完畢，且 `bun x tsc --noEmit` 通過時，你**必須**主動執行以下標準作業流程 (SOP)。在完成這些步驟之前，**絕對不可以宣稱任務已完全結束**。

## 1. 整理開發日誌 (Update CHANGELOG.md)
- **行動指南**：打開 `CHANGELOG.md`，將剛才完成的所有變更寫入 `[Unreleased]` 區塊。
- **寫作規範**：**不要描述修正了甚麼 Bug (除非是極重大修復)**。請使用「功能導向 (Feature-driven)」的語氣，向使用者展示「這個系統現在多出了什麼新能力、新基礎設施」。

## 2. 推進開發藍圖 (Update ROADMAP.md)
- **行動指南**：打開 `ROADMAP.md`。
- **寫作規範**：將剛完成的項目標記為「(✅ 已完成)」，並在該區塊下方使用「技術亮點 (Technical Highlights)」列出實作架構中的核心亮點。嚴禁使用空泛的行銷術語 (buzzwords)，必須專注於具體的工程作法與效益。

## 3. 更新專案門面 (Update README.md)
- **行動指南**：檢查 `README.md` 中的資訊是否過時。
- **寫作規範**：更新版號徽章 (Stage Badge)、新增技術亮點說明，確保 README 能精準反映系統當前的技術實力與架構現狀。

## 4. 執行全域穩定性檢查 (Global Stability Check)
- 確保所有修改已被保存。
- 必須使用命令列執行 `bun test` 與 `bun run lint`，確保新功能的加入沒有破壞現有的核心單元測試。若有損壞，必須在交付前修復。

## 5. 版本號升級與封裝 (Version Bump & Commit) (若適用)
- 若這是一個重大里程碑的結束：
  1. 更新 `package.json` 的 `version` 欄位。
  2. 更新 `src/core/config/DefaultConfig.ts` 中的預設版號。
  3. 將 `CHANGELOG.md` 的 `[Unreleased]` 歸檔為對應的版號與日期。
  4. 使用 Git 將所有文件進行 Commit。

---
**Agent，當你閱讀到這份文件時，請嚴格按照上述步驟審查你當前的工作狀態！**
