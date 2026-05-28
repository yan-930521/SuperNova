# SuperNova: Node.js to Bun Migration Design

## 1. Background & Goals
SuperNova currently uses a standard Node.js/npm ecosystem with Jest for testing and TSC for compilation. To improve developer experience, execution speed, and simplify the toolchain, we are migrating to [Bun](https://bun.sh/).

**Success Criteria:**
- All `npm` commands replaced by `bun`.
- Tests running via `bun test` (replacing Jest).
- Direct `.ts` execution without a separate build step (removing `dist/`).
- Streamlined `package.json` with fewer devDependencies.

## 2. Proposed Changes

### 2.1 Dependency Management
- **Lockfile**: Replace `package-lock.json` with `bun.lockb`.
- **Package Manager**: Use `bun install` for all dependency operations.
- **Cleanup**: 
  - Remove Node/Jest specific devDependencies: `jest`, `ts-jest`, `@types/jest`, `babel-jest`, `@types/node`, `dotenv`.
  - Bun has built-in support for `.env`, so `dotenv` is no longer needed.

### 2.2 Runtime & Execution
- **Direct Execution**: Use `bun run src/index.ts` (or appropriate entry points) directly.
- **Build Step**: The `build` script will be repurposed to perform only type checking (`bun x tsc --noEmit`).
- **Watch Mode**: Use `bun --watch` for local development.

### 2.3 TypeScript Configuration (`tsconfig.json`)
- **Target**: `ESNext` or `ES2022`.
- **Module**: `ESNext`.
- **Module Resolution**: `bundler`.
- **Types**: Replace `node` and `jest` with `bun`.
- **Allow Importing TS**: Enable features that allow Bun to handle imports natively.

### 2.4 Testing Strategy
- **Runner**: Switch from `jest` to `bun test`.
- **Compatibility**: Leverage Bun's built-in Jest-compatible API (`describe`, `test`, `expect`).
- **Config**: Delete `jest.config.js`.

### 2.5 Cleanup Actions
- Delete `dist/` directory.
- Delete `package-lock.json`.
- Add `.bun-version` file to lock the Bun version for the project.

## 3. Implementation Plan (High-Level)
1. Environment verification (Bun installed).
2. Dependency removal and re-installation with Bun.
3. Update `package.json` scripts.
4. Refactor `tsconfig.json`.
5. Verify tests with `bun test`.
6. Final cleanup of legacy configuration files.

## 4. Risks & Mitigations
- **Compatibility**: Some Jest-specific features might differ slightly in `bun test`. 
  - *Mitigation*: Run all existing tests and address specific failures if they occur.
- **Node.js APIs**: If the project uses obscure Node.js APIs not yet fully supported by Bun.
  - *Mitigation*: Bun has 90%+ API compatibility; identify and polyfill or refactor if necessary.
