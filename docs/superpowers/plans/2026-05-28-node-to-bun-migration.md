# Node.js to Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the SuperNova project from Node.js/npm/Jest to Bun/bun-test.

**Architecture:** Replace the Node.js toolchain with Bun's all-in-one runtime. This includes dependency management, test execution, and direct TypeScript execution.

**Tech Stack:** Bun, TypeScript.

---

### Task 1: Environment Preparation & Dependency Cleanup

**Files:**
- Modify: `package.json`
- Delete: `package-lock.json` (if exists), `node_modules/`

- [ ] **Step 1: Verify Bun installation**

Run: `bun --version`
Expected: Output showing Bun version (e.g., `1.x.x`)

- [ ] **Step 2: Remove Node/Jest specific devDependencies from package.json**

Modify `package.json` to remove:
- `jest`
- `ts-jest`
- `@types/jest`
- `babel-jest`
- `@types/node`
- `dotenv`

- [ ] **Step 3: Cleanup legacy lockfile and node_modules**

Run: `rm -rf node_modules package-lock.json`

- [ ] **Step 4: Install dependencies using Bun**

Run: `bun install`
Expected: Creation of `bun.lockb` and updated `node_modules`

- [ ] **Step 5: Commit changes**

```bash
git add package.json
git add bun.lockb
git commit -m "chore: migrate dependency management to bun"
```

---

### Task 2: TypeScript Configuration Update

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Update tsconfig.json for Bun runtime**

Modify `tsconfig.json` with the following values:
```json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "outDir": "./dist",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["bun"]
  },
  "exclude": ["src_bk"]
}
```

- [ ] **Step 2: Verify type checking with Bun**

Run: `bun x tsc --noEmit`
Expected: Success (or identified type errors to fix)

- [ ] **Step 3: Commit changes**

```bash
git add tsconfig.json
git commit -m "chore: update tsconfig for bun"
```

---

### Task 3: Package Scripts & Entry Point Refactoring

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update scripts in package.json**

Replace the `scripts` section:
```json
"scripts": {
  "test": "bun test",
  "build": "bun x tsc --noEmit",
  "lint": "bun x tsc --noEmit",
  "start": "bun src/index.ts"
}
```

- [ ] **Step 2: Commit changes**

```bash
git add package.json
git commit -m "chore: update package scripts for bun"
```

---

### Task 4: Test Suite Migration

**Files:**
- Modify: Existing `.test.ts` files (if needed)
- Delete: `jest.config.js`

- [ ] **Step 1: Run existing tests with bun test**

Run: `bun test`
Expected: See results of tests. Note any failures due to Jest/Bun differences.

- [ ] **Step 2: Fix any test incompatibilities**

(If a test uses a Jest-specific global not in Bun, import it from `bun:test` or adjust syntax).
Example: `import { expect, test, describe, it, beforeEach } from "bun:test";` (Though Bun usually provides these globals).

- [ ] **Step 3: Delete Jest configuration**

Run: `rm jest.config.js`

- [ ] **Step 4: Verify all tests pass**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 5: Commit changes**

```bash
git rm jest.config.js
git commit -m "test: migrate runner to bun test"
```

---

### Task 5: Final Cleanup & Project Marking

**Files:**
- Create: `.bun-version`
- Delete: `dist/`

- [ ] **Step 1: Create .bun-version file**

Run: `bun --version > .bun-version`

- [ ] **Step 2: Remove dist directory**

Run: `rm -rf dist`

- [ ] **Step 3: Final verification run**

Run: `bun run build && bun test`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add .bun-version
git commit -m "chore: final bun migration cleanup"
```
