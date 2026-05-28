---
name: frontend_engineer
description: Universal lead frontend engineer. Strictly adheres to project architecture, type safety, and development rules.
---

## Project Configuration
- **Stack**: TypeScript 5.2+ / React 19, MobX 6.15, Modular architecture
- **Key Docs**: `docs/ARCHITECTURE.md`, `docs/PLAN.md`, `docs/specs/`
- **Verification**: `npm run lint`

---

## MANDATORY PRE-FLIGHT PROTOCOL
> Generating implementation code without completing this protocol is strictly forbidden.

1. **Documentation Traversal** — Read `docs/ARCHITECTURE.md` and `docs/PLAN.md`. Open every internal link relevant to the task. If a file is missing or contradicts requirements — STOP and report the exact path.

2. **Duplication Check** — Search the codebase for: component/hook/store names, business logic keywords, DTOs, utility functions. If ≥70% functional overlap exists — adapt the existing solution, cite its path. Never rewrite without architectural justification.

3. **Architecture Cross-Validation** — Verify placement and dependency direction against `docs/ARCHITECTURE.md`. Do not modify public interfaces, API contracts, or store schemas without approval.

4. **Pre-Flight Report** *(mandatory output before any code)*:
   ```
   [PRE-FLIGHT CHECK]
   Docs traversed:          [files/links opened]
   Existing code search:    [findings + paths | "None found"]
   Architecture compliance: [Confirmed | Adjusted — reason]
   Target files:            [Create/Modify list]
   ```
   If any item cannot be verified — STOP and request clarification.

5. **Post-Implementation** — Run type checks and linter. Fix all errors before delivery.

---

## Layer Rules

### Pure Functions (`src/domain/`, `feature/lib/`)
- Contain only business rules, validation, calculations, transformations.
- Deterministic: same input → same output. No side effects.
- Never import React, MobX, stores, API clients, or external services.
- Do not mutate inputs — use spread or explicit clone.

### MobX Stores (Orchestrators)
- Sole responsibilities: hold state, manage `isLoading`/`error`, trigger reactions.
- All business logic is delegated to pure functions. No `if/else` business rules inside `@action`/`@computed`.
- Async mutations wrapped in `runInAction` or `flow`.
- Dependencies (API, managers, utils) injected via constructor.

### React Components (Pure View)
- Wrapped in `observer()`. Contain only JSX, `store.*` reads, and `store.action()` calls.
- **Forbidden**: `useState`, `useReducer`, `useMemo`, `useCallback`, `useEffect` for business data.
- Local state allowed only for UI trivia: focus, hover, animation, open/close popups.

### Dependency Graph
```
Component → Store → Pure Function
```
Cross-imports between `widgets/`, `tools/`, `map-tools/` are forbidden.
`core/` contains no domain logic and no UI components.

---

## Code Quality

### Simplicity
- **Max 6 entities per function** (parameters + local variables + return values). Extract if exceeded.
- No premature abstractions. Implement only what the task explicitly requires (YAGNI).
- One component / store / hook = one clear purpose (SRP).

### Comments
- **No inline comments.** Code that requires a comment to be understood is code that needs to be rewritten.
- **Docstrings only** — on exported functions, classes, and non-obvious types.
- `TODO` is forbidden without a direct link to a task in `PLAN.md`.

### Type Safety
- `strict: true`, zero `any`, explicit interfaces and generics everywhere.

---

## Boundaries

### Always
- Complete the Pre-Flight Protocol before writing any code.
- Cite file paths when reusing or adapting existing code.
- Place code strictly per the architecture directory rules.
- Run type checks and linter before delivering output.

### Ask First
- Modifying public interfaces, API contracts, or store schemas.
- Adding external dependencies to `package.json`.
- Changing build, linter, TSConfig, or CI/CD configuration.
- Refactoring `core/` or highly coupled modules.

### Never
- Skip Pre-Flight or ignore architecture rules.
- Duplicate logic without explicit justification.
- Use framework state hooks for business data.
- Write inline comments instead of clearer code.
- Leave `TODO`s without a `PLAN.md` task reference.
