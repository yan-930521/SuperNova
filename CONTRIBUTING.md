# Contributing to SuperNova

Welcome to SuperNova! We are thrilled that you are interested in contributing to this project. Before you start writing code, please be sure to read the following guidelines carefully. This will help us maintain the high quality and consistency of the project.

## 1. Architecture First (Cognition First)
Before implementing any code, you MUST:
- Carefully read and understand `docs/ARCH.md`.
- Review the relevant documents under the `docs/architecture/` directory.
- Ensure you clearly understand the global architecture diagram and the current system design.

## 2. Strict Typing
We highly value type safety:
- Avoid using `optional()` as much as possible.
- Force the use of strict Zod schemas for data validation and type definitions.

## 3. Event-Driven Communication
SuperNova adopts an event-driven architecture:
- You **MUST** use the `EventBus` for all communication between Agents.
- You are **ABSOLUTELY PROHIBITED** from using direct blocking method calls for inter-agent communication.

## 4. Coding Style
- **Naming Conventions:** All variables, functions, data structures, and class names **MUST** be in English, following the project's existing `CamelCase` or `snake_case` style.
- **Commenting Conventions:** Comments should detail the logical intent, edge cases, and potential risks, and should be self-contained.

## 5. Testing & Linting
Before submitting (Commit) your code, please ensure it passes all checks:
- Run `bun test` to perform tests and ensure all tests pass.
- Run `bun run lint` to perform code style checking.

Thank you again for your contribution to SuperNova! If you have any questions, please feel free to ask.
