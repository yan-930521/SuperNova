# Task Decomposition Strategy (Phase Level)

## 拆解方針
1. **執行導向**: 將相位目標拆解為 1-3 個具備直接行動價值的「工作單元 (Work)」。
2. **節點屬性**: 
   - `type`: 必須標註為 `work`。
3. **中粒度原則**: 一個 Work 應能由 DoingAgent 在一次 ReAct 循環中完成。此階段嚴禁定義 DoD。
