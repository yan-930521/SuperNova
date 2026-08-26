# SuperNova - NovaLink (Minecraft NeoForge 1.21.1)

NovaLink 是專為 SuperNova AI Agent 打造的 Minecraft 雙向通訊橋樑。
透過極致輕量且高效的 **純 WebSocket + JSON-RPC 2.0** 架構，讓 AI Agent (LLM) 能夠以第一人稱視角「附身」並完全控制 Minecraft 世界中的實體 (Entities)。

## 1. 核心架構：心物二元論 (Mind-Body Architecture)

NovaLink 放棄了傳統慢速的 HTTP Polling 與難以維護的 Webhook，改用全非同步的單一 WebSocket 連線，完美實踐了 AI 的「大腦」與「肉體」分離：

* **大腦 (SuperNova TS / Bun)**: 負責 LLM 決策、記憶檢索、高階規劃。對 Agent 而言，它看到的是一個純粹的 `IBody` 介面（第一人稱肉體感知），它完全不知道底層 RPC 或 UUID 的存在，以為自己真的是活在 Minecraft 的靈魂。
* **神經網路 (WebSocket JSON-RPC)**: 提供近乎零延遲的雙向全雙工通訊。
* **肉體 (Java 模組)**: 徵用 Minecraft 內建的 Netty 引擎手刻出 RPC 伺服器 (`RpcServer`)，將 TS 傳來的高階指令嚴格轉化為物理合法的實體操作 (`MobRpcModule`)，防範作弊指令。

## 2. 系統架構圖

```mermaid
graph TD
    subgraph SuperNova TS (Node/Bun)
        A[LLM Agent / CodeSkill] -->|認知自己是 IBody| B(MobController)
        B -->|封裝請求| C[RpcClient]
    end

    subgraph Minecraft Server (NeoForge 1.21)
        C <-->|WebSocket: 8080\nJSON-RPC 2.0| D[Netty RpcServer]
        D -->|請求分發| E{RpcRegistry}
        E -->|動態綁定 UUID| F[MobRpcModule]
        F -->|安全物理操作| G((Minecraft Mob))
        G -.->|觸發受傷/死亡等事件| F
        F -.->|event.entity_hurt 主動推播| D
    end
```

## 3. 持久化與動態綁定 (Lazy-Loading)

Minecraft 的實體 UUID 只在特定世界 (World) 中有意義。為此，NovaLink 採用了「隨存檔綁定的懶載入機制」：

1. **遊戲內綁定**: 在遊戲對話框中對著實體輸入 `/novalink bind <UUID> mob`，即可建立該實體的 RPC 控制權。
2. **自動持久化**: 綁定紀錄會自動寫入當前存檔的 `run/world/novalink_rpc_bindings.json` (正式服為 `world/` 目錄)。
3. **記憶體安全 (Lazy-Loading)**: 伺服器重啟或區塊重新載入時，只要有 TS 請求進來，`RpcRegistry` 就會動態尋找實體並重新生成 `MobRpcModule`，避免持有過期失效的實體參照 (Stale Reference) 導致崩潰。

## 4. API 能力清單 (JSON-RPC 2.0)

所有通訊皆透過 `ws://127.0.0.1:8080` 完成，`MobRpcModule` 暴露了以下三大類能力給 TS 端：

### 4.1 導航與移動 (Movement)
* `mob.moveTo`: 啟動原生地形 A* 尋路演算法前往絕對座標。
* `mob.stopMove`: 煞車並停止尋路。
* `mob.lookAt` / `mob.lookAtEntity`: 鎖定視角方向或持續注視目標。
* `mob.jump`: 使實體跳躍或在水中游泳。

### 4.2 互動與戰鬥 (Combat & Interaction)
* `mob.attack`: 對指定 UUID 實體進行合法範圍內的近戰攻擊。
* `mob.swingArm`: 揮動手臂 (可指定主/副手)。
* `mob.say`: 讓該實體模擬對話，將文字廣播給周遭 30 格內的玩家。

### 4.3 狀態與感知 (Perception)
* `mob.getStatus`: 獲取精確的三維座標、血量、視角 (yaw/pitch) 與環境判定 (在水中/著火/落地)。
* `mob.getPathStatus`: 獲取當前尋路進度、抵達狀態，供 AI 判斷是否陷入死胡同。
* `mob.getEquipment`: 獲取全身 6 個裝備欄位的物品資料。
* `mob.getNearbyEntities`: 自訂掃描半徑的實體雷達。
* `mob.rayTraceBlocks`: 視線射線檢測，得知眼前正中央的方塊。