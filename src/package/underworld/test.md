# Underworld 指令測試清單 (Test Plan)

這是一份幫助您在 Minecraft 中逐一驗證 Agent 功能的測試清單。請根據您的環境與情境，依序執行測試並打勾確認。

## 1. 觀察與系統控制 (Observe & Control)
- [ ] `observe env` —— 測試 Agent 是否能回報時間、天氣、附近的實體與視線所及的方塊。
- [ ] `observe self` —— 測試 Agent 是否能回報血量、飢餓度、身上的裝備狀態與背包內容物。
- [ ] `stop` —— （可於執行長時間任務如挖礦時輸入）測試是否能成功中斷當前的所有自動任務並停止移動。

## 2. 移動導航 (Navigation)
- [ ] `nav to <x> <y> <z>` —— 提供一組附近的座標，測試 Agent 是否能成功尋路抵達。
- [ ] `nav to <location>` —— 使用 `manage_landmark` 註冊一個地標（如 home），測試 Agent 是否能自動尋路至該地標。
- [ ] `nav follow <player_name>` —— 測試 Agent 是否能跟隨您移動。

## 3. 長期自動任務 (Automation Tasks)
*(註：測試這些指令時，請善用 `stop` 來驗證中斷邏輯，並可用 `here` 代表腳下/眼前)*

- [ ] **挖礦** `mine start here` —— 測試 Agent 是否能自動尋找並挖掘附近的礦石。
- [ ] **挖礦** `mine area <x1> <y1> <z1> <x2> <y2> <z2>` —— 給予一個 3x3x3 的區域座標，測試是否能將其完全挖空。
- [ ] **伐木** `tree cut here` —— 將 Agent 帶到樹林中，測試是否會自動尋找原木並進行砍伐。
- [ ] **農耕** `farm till here` —— 帶 Agent 到草地上，給予鋤頭，測試是否能自動將泥土開墾為耕地。
- [ ] **農耕** `farm harvest here` —— 帶 Agent 到成熟的麥田，測試是否能自動採收。
- [ ] **釣魚** `fishing cast here` —— 給予釣竿並帶到水邊，測試是否能拋竿釣魚。
- [ ] **守衛** `guard here` —— 測試 Agent 是否會在原地警戒，當生成殭屍或實體接近時是否會自動反擊。

## 4. 庫存與合成 (Inventory & Crafting)
- [ ] `inventory` —— 測試是否能印出背包中所有的物品與對應的 slot。
- [ ] `inventory equip <slot>` —— 測試 Agent 是否能將背包內的武器或工具裝備到手上。
- [ ] `inventory drop <item> <count>` —— 測試 Agent 是否能將背包中的物品丟給您。
- [ ] `craft recipe <item>` —— 測試 Agent 是否能查閱物品（如 `planks` 或 `stick`）的合成配方。
- [ ] `craft <item> <count>` —— 在附近放置工作台並給予木頭，測試 Agent 是否能合成木板。

## 5. 容器與熔爐 (Containers & Furnace)
*(註：測試前請先註冊一個容器與熔爐附近的地標，例如 `home_chest` 與 `home_furnace`)*

- [ ] `container deposit <location> <item> <count>` —— 測試 Agent 是否能打開地標附近的箱子並存入物品。
- [ ] `container withdraw <location> <item> <count>` —— 測試 Agent 是否能從箱子中取出剛才存入的物品。
- [ ] `container inspect <location>` —— 測試 Agent 是否能回報箱子內的內容物。
- [ ] `furnace smelt <location> <item> <count>` —— 在熔爐內放好煤炭，測試 Agent 是否能將生肉或礦石放入熔爐。
- [ ] `furnace withdraw <location>` —— 等待燒製完成後，測試 Agent 是否能取出產物。

## 6. 日常互動 (Interactions)
- [ ] `interact use here` —— 指引 Agent 看向一扇門或拉桿，測試是否能觸發互動打開。
- [ ] `interact give <player_name> <item> <count>` —— 測試 Agent 是否會走到您的面前並精準給予指定數量的物品。
- [ ] `sleep <location>` —— 在夜晚將 Agent 帶到地標附近的床邊，測試是否能成功躺上床。
- [ ] `wake` —— 測試 Agent 是否能主動起床。
- [ ] `chat pm <player_name> <message>` —— 測試 Agent 是否能成功使用悄悄話功能傳送訊息給您。
