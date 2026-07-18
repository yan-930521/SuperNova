# 發布與提交前檢查流程 (Before Commit Workflow)

在準備進行 git commit 之前，請嚴格執行以下步驟，確保程式碼品質與專案穩定性：

1. **型別與靜態檢查 (Type & Static Check)**：
   - 執行 `bunx tsc --noEmit` 或對應的 TS 檢查指令，確保全域沒有 TypeScript 型別報錯。
2. **測試文件同步 (Test Synchronization)**：
   - 檢查被更動的原始碼是否具備對應的單元測試。
   - 若原始碼介面有大幅變動，必須同步重構測試檔，確保依賴與 Mock 正確。
3. **單元測試驗證 (Unit Testing)**：
   - 執行 `bun test` 或對應測試指令，確保所有測試案例 100% 通過。
   - 如有失敗，立即暫停流程並修復錯誤。
4. **註解與日誌規範檢查 (Code Convention Check)**：
   - 確認程式碼內的邏輯註解皆為「中文」。
   - 確認變數命名、錯誤訊息、以及寫入 `LogManager` / `Oplog` 的內容皆為「英文」。
   - 確保沒有遺留測試用的 `console.log`。
5. **架構文件同步確認 (Documentation Alignment)**：
   - 確保本次修改的邏輯已經正確反映在 `./docs/ARCH.md` 與相關子系統文件中。
6. **自動生成 Commit 訊息 (Commit Message Generation)**：
   - 根據 `Conventional Commits` 規範 (如 `feat:`, `fix:`, `refactor:`, `docs:`) 構思 Commit 訊息。
   - 統整以上所有結果，並將最終結果與建議的 Commit 訊息匯報給使用者確認。