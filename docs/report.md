透過詳細閱讀 `./docs` 內所有架構與設計文件，我以**資深架構工程師**、**資安工程師**與**效能分析師**的三重視角，對 SuperNova 系統進行了深入的剖析。

總體而言，SuperNova 採用了「非同步並發、事件驅動」與「具身智能解耦」的設計，是一套非常具備前瞻性與擴展潛力的 Agentic 系統。將 PDCA 循環與 DAG 排程器結合，並讓 Agent 在等待時掛起以節省 Token，是極為優秀的工程決策。

然而，從企業級分散式系統與攻防對抗的角度來看，該架構在擴展性、隔離邊界與底層 I/O 上仍存在明顯的隱患與瓶頸。以下是我的銳利評價與改善方案：

---

### 🏛️ 1. 來自「資深架構工程師」的銳利評價與改善
**評價重點**：系統的「關注點分離 (Separation of Concerns)」做得很好，但架構層級中存在過度集中化的漏斗，以及資源重複配置的浪費。

*   **問題一：MainAgent 單點過度集中 (Centralization Bottleneck) 與擴展性限制**
    *   **銳利分析**：`MainAgent` 作為全局「大腦」，承擔了所有的任務拆解、下級 GC 管理，且所有的 `SubAgent` 最終結果都要透過 Deep Merge 回傳給它。當系統面對大量並發場景時，單一中樞將成為邏輯與效能的巨大漏斗，Deep Merge 的鎖定衝突也會急遽增加。
    *   **改善方案**：引入「層級化協調者 (Hierarchical Coordinators)」。不要讓所有子任務直接向 `MainAgent` 匯報，而是建立區域性的 Manager Agent 處理特定領域的聚合。同時，採用分散式狀態同步機制（如 CRDTs, 無衝突複製資料類型），讓部分狀態可以局部異步融合，降低全局鎖定與 Merge 的成本。
*   **問題二：SubAgent 頻繁創建與銷毀 (GC) 造成的上下文預熱浪費 (Churn Overhead)**
    *   **銳利分析**：文件約定 `SubAgent` 完成任務即會被 GC 銷毀。每次啟動全新的 LLM Agent 都需要重新載入 System Prompt、工具定義並建立 KV Cache，這種頻繁的「冷啟動」對 API 延遲與成本是極大的浪費。
    *   **改善方案**：實作 `SubAgent` 的「物件池 (Agent Pool)」機制。任務完成後，不直接銷毀 Agent，而是執行「記憶擦除 (Context Reset)」，僅清空短期的任務資料與 Oplog，保留基礎的人設與工具定義，使其能「溫啟動」無縫承接下一個任務。
*   **問題三：WorkspaceManager 中基於 Git 的隔離可能引發合併地獄 (Merge Hell)**
    *   **銳利分析**：依賴 Git 與實體目錄隔離來處理多個 `SubAgent` 的並行任務，在最終任務成功需合併回主線時，若變更區塊重疊，單靠 Git 無法解決邏輯與語義上的衝突，容易導致系統在最後一哩路卡死。
    *   **改善方案**：設計自動化的「三方合併與衝突解決流水線 (Conflict Resolution Pipeline)」。當底層偵測到 Git 衝突時，系統應自動派發 `ResolveConflictTask` 給專門的 Agent 進行語義修復；且在真正 Merge 之前，強制掛載無頭的自動化測試 (CI) 進行行為校驗，而非盲目合併。

---

### 🛡️ 2. 來自「資安工程師」的銳利評價與改善
**評價重點**：Hot-Lock 防幻覺與 Circuit Breaker 熔斷機制是非常好的自保設計。但系統在信任邊界、輸入清洗與特權管控上存在極度危險的攻擊向量。

*   **問題一：Task 系統中 `input_context` 的模板注入風險 (Prompt / Template Injection)**
    *   **銳利分析**：`Task` 支援模板語法（如 `${Task_A.output.article_url}`）來傳遞依賴。若 Task A 的 Worker 抓取了外部不受信任的資料（如夾帶惡意 Prompt 的網頁內容），該惡意載荷會被無縫注入到 Task B 的 Context 中，直接導致下一個 Agent 被「劫持」並執行越權行為。
    *   **改善方案**：在 `DAGScheduler` 進行資料流轉替換時，必須實施「嚴格的資料清洗 (Sanitization)」與型別驗證。引入沙盒化的上下文分隔機制（例如明確使用特殊符號將外部變數包裹，並在 System Prompt 強制聲明該區塊內容僅為數據，不可作為指令執行）。
*   **問題二：Worker 執行單元缺乏底層沙盒隔離 (Lack of Execution Sandbox)**
    *   **銳利分析**：Worker 負責具體的原子級操作（如 API 呼叫、腳本執行）。文件中並未提及 Worker 的隔離環境。若 Worker 執行了 LLM 生成的惡意腳本，或遭受 SSRF (伺服器端請求偽造) 攻擊，無狀態的 Worker 會直接成為危害宿主作業系統的跳板。
    *   **改善方案**：所有具備網路訪問與程式碼執行能力的 Worker，必須被限制在強隔離的沙盒（如 Docker 容器、gVisor、WebAssembly 或 Firecracker MicroVM）中運行。並對其實行嚴格的網路出口過濾 (Egress Filtering)，僅允許連線至白名單目標。
*   **問題三：MainAgent「上帝視角」的越權災難 (God Mode Over-Privilege)**
    *   **銳利分析**：`MainAgent` 擁有限制外的全系統存取權。這違背了資安的基礎防線，一旦攻擊者透過某種極端的 DataBlock 攻破了 `MainAgent` 的防禦，攻擊者將獲得全系統（包含現實機器人與所有系統配置）的控制權。
    *   **改善方案**：實施「最小權限原則 (PoLP)」與「強制存取控制 (MAC)」。即便是 MainAgent，當需要觸發高風險操作（如修改系統核心、發布具身實體的危險動作）時，必須經過獨立的「權限覆核 API (Authorization Gateway)」驗證，對於最高等級風險應引入 Human-in-the-Loop (人工介入審批) 機制。

---

### ⚡ 3. 來自「效能分析師」的銳利評價與改善
**評價重點**：讓 Agent 在等待 Worker 時掛起（Suspend）是極佳的資源調度策略。但在底層的 I/O 操作與事件通訊上，現有設計難以支撐高吞吐量的高頻場景。

*   **問題一：基於 Git 與實體目錄的磁碟 I/O 災難 (Disk I/O & Inode Exhaustion)**
    *   **銳利分析**：為「每一個」Agent 與 Task 都建立實體隔離目錄並強制 Git 追蹤，代價極高。對於大量生命週期短暫、純粹進行資料處理或查詢（無檔案系統副作用）的任務而言，這會引發嚴重的磁碟 I/O 阻塞，並可能迅速耗盡機器的 Inode 資源。
    *   **改善方案**：實作「分級的 Workspace 儲存層」。對於短暫且無需長期追蹤的 Task，預設分配記憶體虛擬檔案系統 (In-Memory VFS，如 tmpfs) 進行隔離；只有在任務涉及實體的程式碼變更，或需要跨 Agent 長期協作時，才將檔案非同步「落盤 (Flush)」至實體的 Git 儲存庫。
*   **問題二：EventBus 與 DataBlock 的單點吞吐量瓶頸 (Message Broker Bottleneck)**
    *   **銳利分析**：所有的狀態流轉、中斷喚醒與資料回報都依賴 `EventBus`，且 `DataBlock` 包含了具體的 payload。當併發任務激增或資料龐大（如大型檔案、抓取結果）時，單一 EventBus 會產生嚴重的隊列積壓，且龐大物件的序列化/反序列化 (Serialization) 會耗盡 CPU。
    *   **改善方案**：將 `EventBus` 的底層升級為支援分區 (Partitioning) 的分散式 Message Broker (如借鑒 Kafka 或 Redis Stream 的架構)，實現水平擴充。此外，實施「控制面與資料面分離 (Control/Data Plane Separation)」：`DataBlock` 不應夾帶巨量原始資料，而是傳遞資料的 URI 或指標 (Pointer)，大型資料本身應存放入高速快取 (如 Redis) 或物件儲存中。
*   **問題三：DAGScheduler 解析開銷與 Oplog 鎖定競爭 (Lock Contention)**
    *   **銳利分析**：如果 `DAGScheduler` 大量依賴輪詢 (Polling) 來檢查相依節點狀態，會浪費大量 CPU 週期。同時，當多個並行的 `SubAgent` 或 Worker 試圖寫入同一個上下文的 Oplog 檔案時，頻繁的 Hot-Lock 會導致嚴重的資源爭用 (Lock Contention)。
    *   **改善方案**：確保 `DAGScheduler` 是純粹的「事件驅動 (Event-Driven)」，僅在收到特定任務完成的事件信號時，才針對其下游節點進行局部相依性解鎖，避免全圖掃描。針對 Oplog 的寫入，引入批次處理 (Batching) 與無鎖佇列 (Lock-Free Queue) 設計，將同步寫入改為非同步的高速落盤，消除執行緒等待。
