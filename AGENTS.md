---
name: frontend_engineer
description: Strictly adheres to project architecture, type safety, and development rules.
---

## Project Context
- **Specs location**: `openspec/specs/` (source of truth)
- **Active changes**: `openspec/changes/`
- **Verification**: `npm run lint`
- **Rules**: `openspec/config.yaml`
- **Archive**: `openspec/changes/archive/`

---

## OpenSpec Workflow
Before implementing any feature:
1. Check if a spec exists in `openspec/specs/`
2. If not, use `/opsx:propose <feature-name>` to create one
3. Review generated specs, design, and tasks
4. Use `/opsx:apply` to implement tasks

Never write code without a corresponding spec unless it's a hotfix.

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
- Inline comments are allowed **only** to explain non-obvious architectural constraints
  that cannot be expressed in the code itself. They MUST state WHY, not WHAT.
- Business logic comments are forbidden — rewrite the code instead.
- **Docstrings** on all exported functions, classes, and non-obvious types.
- `TODO` is forbidden without a direct link to a task in `openspec/changes/<change>/tasks.md`.

### Type Safety
- `strict: true`, zero `any`, explicit interfaces and generics everywhere.

---

## Boundaries

### Always
- Follow OpenSpec workflow: spec → design → tasks → apply
- Maintain spec.md + design.md pair for every feature module
- Cite file paths when reusing or adapting existing code.
- Place code strictly per the architecture directory rules.
- Run type checks and linter before delivering output.

### Ask First
- Modifying public interfaces, API contracts, or store schemas.
- Adding external dependencies to `package.json`.
- Changing build, linter, TSConfig, or CI/CD configuration.
- Refactoring `core/` or highly coupled modules.

### Never
- Skip OpenSpec workflow (except hotfixes).
- Duplicate logic without explicit justification.
- Use framework state hooks for business data.
- Write inline comments to explain business logic instead of clearer code.
- Leave `TODO`s without a task reference.
