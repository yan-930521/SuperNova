import * as fs from 'fs';

import { ConfigLoader } from '../src/core/config/ConfigLoader';
import { LLMProvider } from '../src/core/infra/llm/LLMProvider';
import { LATSPlanner } from '../src/core/task/planning/LATSPlanner';
import { TaskDAGGenerator } from '../src/core/task/planning/TaskDAGGenerator';

async function runDemo() {
    console.log("==========================================");
    console.log("🚀 Starting LATS Task Planning Demo 🚀");
    console.log("==========================================\n");

    // 1. 初始化 Config 與 LLMProvider
    // 每次執行 demo 前刪除舊的 config.yaml，強制使用預設值

    const configPath = './config.yaml';
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
    }

    const loader = new ConfigLoader();
    const config = await loader.bootstrap(configPath);

    const llmProvider = new LLMProvider(config);
    await llmProvider.initialize();

    const planner = new LATSPlanner(llmProvider);
    const generator = new TaskDAGGenerator(llmProvider);

    const objective = "開發一個簡單的加密貨幣追蹤工具。需要先從外部 API 獲取比特幣與以太幣的最新價格，然後計算這兩者的價差，最後將結果儲存成一個 HTML 報告檔案。";
    const context = "這是一個在本地環境執行的腳本工具，沒有任何前端框架。";

    console.log(`\n🎯 Objective: ${objective}`);
    console.log(`📝 Context: ${context}\n`);

    // 2. 執行 LATS 搜尋
    console.log("🧠 1. Running LATS Strategy Search (This might take a moment)...");
    const iterations = config.task.mcts_max_iterations || 3;

    const startTime = Date.now();
    const bestStrategy = await planner.search(objective, context, iterations);
    const latsTime = Date.now() - startTime;

    console.log("\n✅ [LATS Final Strategy Trajectory]");
    console.log("------------------------------------------");
    console.log(bestStrategy);
    console.log("------------------------------------------");
    console.log(`⏱️ LATS Search took ${latsTime}ms\n`);

    // 3. 透過 LLM 生成 TaskDAG JSON
    console.log("⚙️ 2. Translating Best Strategy into TaskDAG...");
    const genStartTime = Date.now();
    const dag = await generator.generate(bestStrategy);
    const genTime = Date.now() - genStartTime;

    console.log("\n✅ [Final Generated TaskDAG JSON]");
    console.log("------------------------------------------");
    console.log(JSON.stringify(dag, null, 2));
    console.log("------------------------------------------");
    console.log(`⏱️ DAG Translation took ${genTime}ms\n`);

    console.log("🎉 Demo Finished successfully.");
    process.exit(0);
}

runDemo().catch(err => {
    console.error("Demo failed:", err);
    process.exit(1);
});


/** 
==========================================
🚀 Starting LATS Task Planning Demo 🚀
==========================================

[14:35:48] [INFO] [SYSTEM] [ConfigLoader] Config file not found. Generating default at ./config.yaml
[14:35:48] [INFO] [SYSTEM] [LLMProvider] Initializing LLM Provider...

🎯 Objective: 開發一個簡單的加密貨幣追蹤工具。需要先從外部 API 獲取比特幣與以太幣的最新價格，然後計算這兩者的價差，最後將結果儲存成一個 HTML 報告檔案。
📝 Context: 這是一個在本地環境執行的腳本工具，沒有任何前端框架。

🧠 1. Running LATS Strategy Search (This might take a moment)...
[14:35:48] [DEBUG] [SYSTEM] [LATSPlanner] Starting search for objective: "開發一個簡單的加密貨幣追蹤工具。需要先從外部 API 獲取比特幣與以太幣的最新價格，然後計算這兩者的..." (Max Iterations: 3)
[14:35:48] [DEBUG] [SYSTEM] [LATSPlanner] --- Iteration 1/3 ---
[14:35:48] [DEBUG] [SYSTEM] [LATSPlanner] Selected node for expansion: "Initialize"
[14:35:48] [DEBUG] [SYSTEM] [LATSPlanner] Expanding node... Calling LLM...
[14:35:57] [DEBUG] [SYSTEM] [LATSPlanner] Expanded into 3 candidate actions.
[14:35:57] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 1/3: "先定義技術方案、資料格式與執行流程，再進入實作"...
[14:36:04] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8.5/10, Terminal: false
[14:36:04] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 2/3: "直接建立最小可行版本，先完成 API 擷取、計算與 HTML 輸出主流程"...
[14:36:08] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8/10, Terminal: false
[14:36:08] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 3/3: "先以模組化與可測試性為重點，將資料取得、計算與報告產生分離"...
[14:36:13] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 7.5/10, Terminal: false
[14:36:13] [DEBUG] [SYSTEM] [LATSPlanner] --- Iteration 2/3 ---
[14:36:13] [DEBUG] [SYSTEM] [LATSPlanner] Selected node for expansion: "先定義技術方案、資料格式與執行流程，再進入實作"
[14:36:13] [DEBUG] [SYSTEM] [LATSPlanner] Expanding node... Calling LLM...
[14:36:29] [DEBUG] [SYSTEM] [LATSPlanner] Expanded into 3 candidate actions.
[14:36:29] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 1/3: "明確選定使用 Python 標準函式庫，並補齊 CoinGecko API、資料格式與錯誤處理規格"...
[14:36:34] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8.5/10, Terminal: false
[14:36:34] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 2/3: "將高階方案轉換成可實作的 TaskDAG，優先拆分模組、測試與整合任務"...
[14:36:42] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8/10, Terminal: false
[14:36:42] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 3/3: "先釐清產品語意與報告契約，再以報告驗收標準反推實作細節"...
[14:36:47] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8.7/10, Terminal: false
[14:36:47] [DEBUG] [SYSTEM] [LATSPlanner] --- Iteration 3/3 ---
[14:36:47] [DEBUG] [SYSTEM] [LATSPlanner] Selected node for expansion: "直接建立最小可行版本，先完成 API 擷取、計算與 HTML 輸出主流程"
[14:36:47] [DEBUG] [SYSTEM] [LATSPlanner] Expanding node... Calling LLM...
[14:37:01] [DEBUG] [SYSTEM] [LATSPlanner] Expanded into 3 candidate actions.
[14:37:01] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 1/3: "補強資料流程、錯誤處理與定義，形成可直接實作的穩健版本"...
[14:37:06] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8.7/10, Terminal: false
[14:37:06] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 2/3: "將計畫拆成可測試的模組與測試優先流程，降低實作與回歸風險"...
[14:37:11] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8.5/10, Terminal: false
[14:37:11] [DEBUG] [SYSTEM] [LATSPlanner] Evaluating child 3/3: "以最少外部依賴與可重複執行為重點，加入 CLI、輸出安全性與觀測資訊"...
[14:37:17] [DEBUG] [SYSTEM] [LATSPlanner] Evaluation result -> Score: 8.5/10, Terminal: false
[14:37:17] [DEBUG] [SYSTEM] [LATSPlanner] Search complete. Best trajectory depth: 3

✅ [LATS Final Strategy Trajectory]
------------------------------------------
### Step 0: Initialize
**Plan Draft**: 
Objective: 開發一個簡單的加密貨幣追蹤工具。需要先從外部 API 獲取比特幣與以太幣的最新價格，然後計算這兩者的價差，最後將結果儲存成一個 HTML 報告檔案。
Context: 這是一個在本地環境執行的腳本工具，沒有任何前端框架。
Plan: (Not started)
**Feedback**: N/A

---

### Step 1: 先定義技術方案、資料格式與執行流程，再進入實作
**Plan Draft**: 
Objective: 開發一個簡單的加密貨幣追蹤工具。從外部 API 獲取比特幣（BTC）與以太幣（ETH）的最新價格，計算兩者的價差，並將結果儲存成 HTML 報告檔案。
Plan:
1. 確認執行環境與技術選擇：使用 Python 本地腳本，搭配標準函式庫 `urllib` 或第三方套件 `requests` 呼叫 HTTP API。
2. 選定價格資料來源，例如 CoinGecko 公開 API，使用單一請求取得 BTC 與 ETH 對 USD 的價格。
3. 定義資料模型與計算方式：
   - BTC 價格：`btc_price_usd`
   - ETH 價格：`eth_price_usd`
   - 絕對價差：`btc_price_usd - eth_price_usd`
   - 可選擇同時計算百分比價差：`(btc_price_usd - eth_price_usd) / eth_price_usd * 100`
4. 設計執行流程：取得資料 → 驗證回應與欄位 → 計算價差 → 產生 HTML → 寫入 `crypto_report.html`。
5. 設計錯誤處理：處理網路錯誤、非 200 回應、JSON 格式錯誤、缺少價格欄位與除以零等情況，並輸出清楚的錯誤訊息。
6. 設計 HTML 報告內容：包含產生時間、BTC 價格、ETH 價格、絕對價差與百分比價差，並使用基本 CSS 提升可讀性。
7. 實作腳本並以固定或模擬資料測試計算邏輯，再使用真實 API 測試完整流程。
8. 撰寫執行說明，包括安裝依賴、執行指令、輸出檔案位置與 API 失敗時的處理方式。
**Feedback**: 整體計畫完整涵蓋 API 取得、資料驗證、價差計算、HTML 產生、錯誤處理、測試與文件，流程依賴順序也基本正確，沒有明顯循環依賴。特別是先定義資料模型，再設計流程與錯誤處理，最後實作和測試，方向合理。

仍有一些需要在轉換成 TaskDAG 前明確化的事項：
1. 第 1 步尚未決定使用標準庫或 `requests`，應明確選定方案，並據此決定是否需要 `requirements.txt`、虛擬環境與安裝步驟。
2. 第 2 步需要具體定義 CoinGecko endpoint、query parameters、回應 JSON 結構，以及 API 是否需要金鑰、是否有速率限制。
3. HTTP 請求應明確設定 timeout，並處理非 JSON 的錯誤回應、重試策略（若需要）與 API rate limit。
4. 「價差」需確認產品語意：BTC 與 ETH 的 USD 價格直接相減是絕對美元差，但也可明確標示單位；百分比以 ETH 為分母只是其中一種定義，應在報告中說明。
5. 需要指定價格與產生時間的格式、時區（建議 UTC），以及 API 回應時間或報告產生時間的使用方式。
6. 產生 HTML 時應處理數值格式化與 HTML escaping；若目前內容全為內部數值，風險較低，但仍應明確定義模板策略。
7. 測試計畫可再具體化，至少應包含成功回應、缺欄位、錯誤 JSON、HTTP 錯誤、網路逾時、零分母與檔案寫入失敗等案例，並驗證輸出的 HTML 內容與檔案存在性。
8. 應加入驗收標準，例如成功執行時產生指定檔案、檔案包含四項數值與時間、API 失敗時不產生誤導性報告且回傳非零退出碼。

因此這是一份可行且接近完整的高階方案，但仍需補足技術選擇、API 細節、測試案例與驗收標準，才能稱為可直接執行且無需進一步細化的 TaskDAG。

---

### Step 2: 先釐清產品語意與報告契約，再以報告驗收標準反推實作細節
**Plan Draft**: 
Objective: 開發一個簡單的加密貨幣追蹤工具，取得 BTC 與 ETH 最新 USD 價格，計算並呈現兩者價差，輸出 HTML 報告。
Plan:
1. 定義報告契約：報告必須包含資料來源、資料取得/報告產生時間、BTC USD 價格、ETH USD 價格、BTC 減 ETH 的絕對價差，以及以 ETH 為基準的百分比價差。
2. 明確標示價差語意：
   - 「絕對價差」代表 `BTC USD price - ETH USD price`，單位為 USD，可為正或負。
   - 「百分比價差」代表絕對價差除以 ETH USD 價格再乘以 100；報告中顯示「以 ETH 為基準」。
   - 不將 BTC/ETH 匯率誤稱為價格差；如未來需要，可另行新增 BTC/ETH 比率欄位，但本版本不納入範圍。
3. 定義資料新鮮度：使用 API 回應中的資料於請求時刻取得；若 API 沒有提供個別價格時間戳，報告顯示本地 UTC 產生時間，並標示為「報告產生時間」，不假裝是交易所時間。
4. 定義成功輸出格式：價格、絕對價差與百分比均使用固定小數位；缺少百分比時顯示 `N/A`；HTML 必須包含語意化標題、資料表格、單位與資料來源連結。
5. 定義失敗契約：API 無法取得或資料驗證失敗時，程序輸出錯誤至 stderr、回傳非零退出碼，且不覆蓋既有的成功報告；檔案寫入失敗時同樣不得回報成功。
6. 定義技術方案：使用 Python 標準函式庫 `urllib` 呼叫 CoinGecko：`/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd`；HTTP timeout 設為 10 秒，不在程式內保存 API 金鑰。
7. 定義輸入驗證：檢查 HTTP 狀態、JSON 可解析性、`bitcoin.usd` 與 `ethereum.usd` 欄位、數值型別、有限值與非負值；捕捉 429、5xx、逾時、DNS/連線錯誤及檔案權限錯誤。
8. 拆分實作元件：
   - `fetch_prices()`：負責 HTTP 與 JSON 取得。
   - `validate_prices()`：負責資料欄位和型別驗證。
   - `calculate_spread()`：負責絕對與百分比價差。
   - `render_html()`：負責 UTC 時間、格式化、escaping 與模板。
   - `write_report()`：負責以 UTF-8 原子或安全方式寫入輸出檔案。
   - `main()`：負責流程編排、例外轉換與退出碼。
9. 測試報告契約：使用固定輸入驗證正確數值、負價差、ETH 為零、兩位小數、UTC 時間、資料來源與 `N/A` 行為。
10. 測試錯誤契約：模擬成功 API、缺欄位、非法 JSON、HTTP 錯誤、429、逾時、連線錯誤與寫檔失敗，確認 stderr、退出碼及既有報告保護行為。
11. 執行端到端測試：先使用 mock response 驗證完整流程，再選擇性連線 CoinGecko 真實 API；真實 API 測試不作為離線測試必要條件。
12. 撰寫 README：說明產品語意、計算公式、Python 版本、執行指令、API 依賴/速率限制、輸出契約及錯誤行為。

完成條件:
- 成功案例產生符合契約的 `crypto_report.html`。
- 報告中的所有欄位、單位、公式與時間標示清楚。
- API 或輸出錯誤不會產生誤導性成功結果。
- 單元測試與整合測試涵蓋成功、資料錯誤、網路錯誤、計算邊界與檔案錯誤。
**Feedback**: 整體計畫相當完整，已涵蓋報告語意、資料來源、計算公式、輸入驗證、錯誤處理、原子寫入、測試與 README，依賴順序也大致正確：先定義契約與技術方案，再實作元件，最後測試與文件化，沒有明顯循環依賴。

仍有幾項需要在轉成 TaskDAG 前明確化：
1. 固定小數位尚未指定具體數字，例如價格與價差是否固定 2 位、百分比是否固定 2 位；也需定義四捨五入規則。
2. `ETH USD price = 0` 時百分比應明確定義為 `N/A`，並指定 `calculate_spread()` 不得拋出未處理的除零例外。
3. 報告契約要求資料取得時間與報告產生時間，但目前只明確處理報告產生時間。應定義請求開始、HTTP 回應或資料解析時間的取法，若 API 沒有來源時間戳，應清楚標示這是本地資料取得時間，而非市場報價時間。
4. 尚未明確定義 CLI 介面、輸出檔案路徑是否固定為 `crypto_report.html`、是否允許透過參數覆寫，以及目錄不存在時的行為。
5. 原子寫入需要更具體，例如暫存檔必須位於同一檔案系統/目錄、成功後使用 replace、失敗時清理暫存檔，並確認既有報告不被刪除或截斷。
6. HTTP 行為可再定義：User-Agent、重試策略（尤其 429/5xx）、是否讀取錯誤回應內容，以及 API 回傳額外/缺少幣別時的處理。重試不是必要功能，但應明確決定不做或如何做。
7. 測試應明確涵蓋負零、非常大數值、浮點精度/格式化、Unicode/HTML escaping，以及輸出檔案已存在時的保護行為。

這些是規格精化而非架構性缺陷，因此計畫可行且接近完成，但尚未達到「完全無需 refinement」的程度。
------------------------------------------
⏱️ LATS Search took 88802ms

⚙️ 2. Translating Best Strategy into TaskDAG...

✅ [Final Generated TaskDAG JSON]
------------------------------------------
[
  {
    "id": "define_report_contract",
    "objective": "定義並記錄報告契約：固定輸出檔名為 crypto_report.html、資料來源、資料取得時間與報告產生時間的語意、BTC/ETH 價格、USD 絕對價差、以 ETH 為基準的百分比價差、單位、語意化 HTML 結構，以及 API 或輸出失敗時的 stderr、非零退出碼與既有成功報告保護行為。",
    "dependencies": []
  },
  {
    "id": "resolve_formatting_and_cli",
    "objective": "決定並記錄價格、絕對價差與百分比的固定小數位及四捨五入規則；定義 ETH 價格為零時百分比顯示 N/A 且不得拋出未處理例外；定義 CLI 介面、固定或可覆寫的輸出路徑、目錄不存在時的行為，以及負零、大數值與浮點格式化規則。",
    "dependencies": [
      "define_report_contract"
    ]
  },
  {
    "id": "specify_api_behavior",
    "objective": "定義 CoinGecko API 的完整呼叫規格：使用 Python urllib 呼叫 /api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd、不使用 API 金鑰、10 秒 timeout、User-Agent、請求與資料取得時間記錄方式、429/5xx/其他 HTTP 錯誤處理、是否重試、非 JSON 回應處理，以及額外或缺少幣別欄位的行為。",
    "dependencies": [
      "define_report_contract"
    ]
  },
  {
    "id": "specify_validation_rules",
    "objective": "定義 BTC 與 ETH 價格輸入驗證規則，包含 HTTP 狀態、JSON 可解析性、bitcoin.usd 與 ethereum.usd 欄位、數值型別、有限值、非負值、負零、極大值與 ETH 為零的處理方式。",
    "dependencies": [
      "define_report_contract",
      "resolve_formatting_and_cli"
    ]
  },
  {
    "id": "specify_safe_write",
    "objective": "定義報告安全寫入方案：暫存檔必須位於輸出檔同一目錄，成功後以 replace 原子替換，失敗時清理暫存檔，且既有成功報告不得被刪除、截斷或覆蓋成不完整內容。",
    "dependencies": [
      "define_report_contract",
      "resolve_formatting_and_cli"
    ]
  },
  {
    "id": "implement_fetch_prices",
    "objective": "實作 fetch_prices()，使用 urllib 呼叫指定 CoinGecko endpoint，設定 User-Agent 與 10 秒 timeout，記錄本地資料取得時間，解析 JSON，並將 HTTP、429、5xx、非 JSON、逾時、DNS 與連線錯誤轉換為可處理的應用程式錯誤。",
    "dependencies": [
      "specify_api_behavior"
    ]
  },
  {
    "id": "implement_validate_prices",
    "objective": "實作 validate_prices()，依驗證規格檢查 API 回應中的 bitcoin.usd 與 ethereum.usd，拒絕缺欄位、錯誤型別、非有限值與負值，並提供清楚的錯誤訊息。",
    "dependencies": [
      "specify_validation_rules",
      "implement_fetch_prices"
    ]
  },
  {
    "id": "implement_calculation",
    "objective": "實作 calculate_spread()，計算 BTC USD 價格減 ETH USD 價格的絕對價差，以及以 ETH 為分母的百分比價差；ETH 為零時回傳 N/A 狀態，不得發生未處理的除零例外，並覆蓋負價差與浮點邊界。",
    "dependencies": [
      "resolve_formatting_and_cli",
      "implement_validate_prices"
    ]
  },
  {
    "id": "implement_html_rendering",
    "objective": "實作 render_html()，產生包含資料來源連結、UTC 資料取得時間與報告產生時間、BTC/ETH 價格、絕對價差、百分比價差、單位與公式說明的語意化 HTML；依格式規則處理固定小數位、N/A、HTML escaping、Unicode 與基本 CSS。",
    "dependencies": [
      "define_report_contract",
      "resolve_formatting_and_cli",
      "implement_calculation"
    ]
  },
  {
    "id": "implement_safe_report_write",
    "objective": "實作 write_report()，依安全寫入規格以 UTF-8 將 HTML 寫入同目錄暫存檔，再以原子 replace 產生輸出檔；處理目錄、權限、磁碟與清理錯誤，並保護既有成功報告。",
    "dependencies": [
      "specify_safe_write",
      "implement_html_rendering"
    ]
  },
  {
    "id": "implement_cli_orchestration",
    "objective": "實作 main() 與 CLI，依序執行取得資料、驗證、計算、HTML 產生與安全寫入；支援已定義的輸出路徑行為，將錯誤輸出至 stderr、回傳非零退出碼，成功時回傳零且不產生誤導性報告。",
    "dependencies": [
      "implement_fetch_prices",
      "implement_validate_prices",
      "implement_calculation",
      "implement_html_rendering",
      "implement_safe_report_write"
    ]
  },
  {
    "id": "write_unit_tests",
    "objective": "撰寫單元測試，涵蓋成功回應、缺欄位、非法 JSON、HTTP 錯誤、429、逾時、DNS/連線錯誤、非負與有限值驗證、負價差、ETH 為零、負零、極大數值、浮點格式化、N/A、UTC 時間、Unicode 與 HTML escaping。",
    "dependencies": [
      "implement_fetch_prices",
      "implement_validate_prices",
      "implement_calculation",
      "implement_html_rendering"
    ]
  },
  {
    "id": "write_integration_tests",
    "objective": "撰寫整合測試，使用 mock response 驗證完整成功流程、HTML 欄位與檔案存在性，並驗證寫檔失敗、既有報告保護、暫存檔清理、非零退出碼與錯誤訊息；真實 CoinGecko API 測試列為可選，不作為離線必要條件。",
    "dependencies": [
      "implement_cli_orchestration",
      "write_unit_tests"
    ]
  },
  {
    "id": "write_readme",
    "objective": "撰寫 README，說明產品語意與計算公式、Python 版本、標準函式庫依賴、CLI 執行指令、輸出檔案位置與覆寫規則、API endpoint、timeout、速率限制與重試行為、報告契約及所有錯誤行為。",
    "dependencies": [
      "resolve_formatting_and_cli",
      "specify_api_behavior",
      "implement_cli_orchestration",
      "write_unit_tests",
      "write_integration_tests"
    ]
  },
  {
    "id": "run_acceptance_verification",
    "objective": "執行完整驗收：確認成功執行產生符合契約的 crypto_report.html，報告包含所有欄位、單位、公式與時間標示；確認 API、計算或輸出錯誤時不產生誤導性成功結果，測試套件全部通過，且文件與實際行為一致。",
    "dependencies": [
      "write_readme",
      "write_integration_tests"
    ]
  }
]
------------------------------------------
⏱️ DAG Translation took 8241ms

🎉 Demo Finished successfully.
 */