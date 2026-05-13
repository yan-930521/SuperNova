# ReadFileTool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 `ReadFileTool` 用於讀取 Sandbox 範圍內的檔案。

**Architecture:** 繼承自 `BaseFileTool`，使用 `fs/promises` 進行非同步讀取，並透過 `zod` 進行輸入驗證。

**Tech Stack:** TypeScript, Node.js `fs/promises`, `zod`, `jest`.

---

### Task 1: 實作 ReadFileTool 與基礎測試

**Files:**
- Create: `src/tool/file/ReadFileTool.ts`
- Test: `tests/tools/ReadFileTool.test.ts`

- [ ] **Step 1: 撰寫失敗的測試 (Red)**

```typescript
import { ReadFileTool } from '../../src/tool/file/ReadFileTool';
import { IToolContext } from '../../interfaces/tool/IToolContext';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('ReadFileTool', () => {
  let tool: ReadFileTool;
  const mockContext: IToolContext = {
    sessionId: 'test-session',
    agentId: 'test-agent'
  } as any;

  beforeEach(() => {
    tool = new ReadFileTool();
  });

  test('should read a file from workspace', async () => {
    const workspaceDir = path.resolve(process.cwd(), 'workspace');
    const testFilePath = path.join(workspaceDir, 'test-read.txt');
    const content = 'Hello, SuperNova!';
    
    // 確保測試檔案存在
    await fs.writeFile(testFilePath, content);
    
    try {
      const result = await tool.run({ path: 'workspace/test-read.txt' }, mockContext);
      expect(result).toBe(content);
    } finally {
      // 清理測試檔案
      await fs.unlink(testFilePath).catch(() => {});
    }
  });
});
```

- [ ] **Step 2: 執行測試並驗證失敗**

執行: `npm test tests/tools/ReadFileTool.test.ts`
預期結果: 失敗 (模組未找到或類別未定義)

- [ ] **Step 3: 實作最小化代碼 (Green)**

```typescript
import { BaseFileTool } from './BaseFileTool';
import { IToolContext } from '../../../interfaces/tool/IToolContext';
import { z } from 'zod';
import * as fs from 'fs/promises';

/**
 * ReadFileTool 檔案讀取工具
 * 繼承自 BaseFileTool，提供安全的檔案讀取功能。
 */
export class ReadFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super(
      'read_file',
      '讀取檔案內容',
      'TIER_1',
      ['file_read'],
      z.object({
        path: z.string().describe('目標檔案路徑')
      })
    );
  }

  /**
   * 執行讀取邏輯
   * @param input 包含路徑的輸入
   * @param context 工具執行上下文
   */
  async run(input: { path: string }, context: IToolContext): Promise<string> {
    const absolutePath = this.validatePath(input.path, 'read');
    return await fs.readFile(absolutePath, 'utf-8');
  }
}
```

- [ ] **Step 4: 執行測試並驗證通過**

執行: `npm test tests/tools/ReadFileTool.test.ts`
預期結果: 通過

- [ ] **Step 5: 增加更多測試案例 (專案根目錄與錯誤處理)**

在 `tests/tools/ReadFileTool.test.ts` 中增加：

```typescript
  test('should read README.md from project root', async () => {
    const result = await tool.run({ path: 'README.md' }, mockContext);
    expect(result).toContain('SuperNova');
  });

  test('should throw error for blacklisted files', async () => {
    await expect(tool.run({ path: '.env' }, mockContext)).rejects.toThrow(/Access denied/);
  });

  test('should throw error for non-existent files', async () => {
    await expect(tool.run({ path: 'workspace/non-existent-file.txt' }, mockContext)).rejects.toThrow();
  });
```

- [ ] **Step 6: 執行所有測試並驗證通過**

執行: `npm test tests/tools/ReadFileTool.test.ts`
預期結果: 通過

- [ ] **Step 7: Commit 變更**

```bash
git add src/tool/file/ReadFileTool.ts tests/tools/ReadFileTool.test.ts
git commit -m "feat: add ReadFileTool"
```
