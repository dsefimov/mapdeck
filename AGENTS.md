## Project Context

- **Entry docs**: this file (rules + workflow) → `docs/architecture.md` (system overview) → `docs/glossary.md` (domain terms) → `docs/adr/` (decisions with rationale).

---

## Workflow

Before implementing any task:

1. **Plan.** Write a task plan: scope, approach, affected files, verification steps. The plan lives in the session / `plans/` and is never committed. A plan is a working artifact, not documentation; it dies with the task. Durable outcomes of a task are code, tests, and — if triggered — an ADR.
2. **Implement.** Code + tests. Edge cases and business rules are documented by tests (`it.each`), never by prose.
3. **ADR check.** If the task hits an ADR trigger (below), draft `docs/adr/NNNN-*.md` (Context / Decision / Consequences) and get sign-off.
4. **Gate.** `npm run lint` + `npm run test` + `npm run build` green; stage complete. Git hooks enforce it where the work happens: `pre-commit` runs lint + test on every commit, `pre-push` runs the build (installed automatically on `npm install`; `--no-verify` is the WIP escape hatch). A change is not done until all three are green. The E2E smoke (`npm run test:e2e`, `tests/`) runs on demand — minutes against live demo sources, deliberately outside the hooks; run it before merging UI-facing work.

Never write code without a task plan.

A change that invalidates a name or rule in this file (rename, move, removal) updates
this file and `docs/` in the same change — never as a follow-up.

### ADR triggers

An ADR is required when:

- public types in `src/core/contracts/**` change;
- a new domain / protocol / extension appears;
- a new external dependency is added;
- store architecture changes;
- a decision's "why" is not visible from code (a trade-off).

No ADR for: bug fixes, UI tweaks, contract-preserving refactors.

### ADR hygiene

The set stays small enough to read as the project's essence and constraints in one
pass. A new decision first looks for an existing ADR to amend; a new number is
allocated only for a genuinely new concept, and the new file must say why no existing
ADR can host the decision. A reversed decision is amended in place with a dated note
stating what changed and why — never silently deleted.

Check: review of every new file in `docs/adr/`.

An amendment may state its decision in the present tense even before the code lands;
it then carries one status line — `Implementation: pending — <work>` — and the change
that lands the implementation removes the line. What the status line must never do is
go stale silently: a review that finds an unimplemented decision without one adds it.

### Documentation policy

- Docs are not a separate source of truth — code, types, tests and configs are. Docs explain "why" and context only.
- All committed documentation is in English.
- Business rules live in `logic/*.ts` + colocated tests; they are never restated in prose.
- JSDoc is required on exported functions, classes, and non-obvious types. `jsdoc/require-jsdoc` (`publicOnly`, error) enforces it on `src/core/contracts/**` and `src/core/domain/**` for exported functions, interfaces, and type aliases; classes, class methods, and zones outside these two are enforced on review.

---

## Layer Rules

### Core Structure (`src/core/`)

Five layers, one composition root in `src/app/`:

- `lib/` — technical primitives, no domain words, no React: `async/`, `registry/`, `state/`, `logger/`, `text/`, `color/`, `geo/` (pure geo math incl. `Bbox`, `FrustumPlanes`).
- `common/` — technical subsystems, reusable without geo coupling: `locale/` (i18n), `settings/`, `widget/` (widget catalog + grid layout state), `state/` (MobX-flavored async-state primitives). Stores here receive `rootStore: CommonRegistry` — the technical slice of the single access point, without domain knowledge.
- `ui/` — generic React kit (`components/`, `composites/`, `hooks/`, `icons/`, `theme/`, `utils/`). Imports `lib` only.
- `contracts/` — ports and shared kernel (`domain/`, `extension/`): types shared by ≥2 consumers, plus the extension-context family.
- `shell/` — DI glue: `StoreProvider`, `useRootStore` (returns `StoreRegistry`). Imports `contracts` and the `StoreRegistry` composition type; used by `app` and extensions.
- `domain/` — bounded contexts: `layer-tree/`, `map/`, `protocols/` (one folder per data protocol; the full list lives in `docs/architecture.md`). The skeleton grows with the domain (see rule 3 in "Where code goes"): a leaf protocol may be a flat descriptor; a grown domain carries `types.ts` + `logic/` + `stores/` + `index.ts`, `adapters/` when it implements ports. The single access point across domains is `src/core/store-registry.ts`.
- `src/app/` — composition root: `rootStore.ts` (`RootStore implements StoreRegistry`), `bootstrap.ts`, `mobxConfig.ts`.

### Pure Functions (`domain/*/logic/`, `lib/geo/`)

- Contain only business rules, validation, calculations, transformations.
- Deterministic: same input → same output. No side effects.
- Never import React, MobX, stores, API clients, or external services.
- Do not mutate inputs — use spread or explicit clone.

### MobX Stores (Orchestrators)

- Sole responsibilities: hold state, manage `isLoading`/`error`, trigger reactions.
- All business logic is delegated to pure functions. No `if/else` business rules inside `@action`/`@computed`.
- Async mutations wrapped in `runInAction` or `flow`.
- Dependencies (API, managers, utils) injected via constructor.

**Store Architectural Principle:**

```
Store owns state and coordinates operations.
Operations own business logic — they are the primary abstraction.
Traversal, predicates, and structural helpers are internal building blocks
and MUST NOT be orchestrated directly by the store.
```

New capabilities SHALL be added as new domain operations — the store requires zero changes beyond calling the new operation and applying its result.

### React Components (Pure View)

- Wrapped in `observer()`. Contain only JSX, `store.*` reads, and `store.action()` calls.
- **Forbidden**: `useState`, `useReducer`, `useMemo`, `useCallback`, `useEffect` for business data.
- Local state allowed only for UI trivia: focus, hover, animation, open/close popups.
- Interaction orchestration — event wiring, state machines, async pipelines — lives in a controller class obtained via `stateStore.get(instanceId, ...)`; the component is a thin observer, and `useEffect` is wiring only (attach/detach on mount/unmount). Precedent: `LayerTreeViewModel` (ADR-0002).

### Dependency Graph

```
app ──→ domain ──→ ui ──→ lib
 │         │  ╰────→ common ─╮
 │         ╰──→ contracts ────┤
 ▼                           │
 store-registry ◄────────────╯
 (CommonRegistry + DomainRegistry + declared-points contexts)
```

- `lib` imports nothing; `ui → lib` (plus `mobx-react-lite` for the WidgetGrid precedent alone — the grid renders store-driven layouts; every other kit component stays plain React); `common → contracts + lib`; `contracts → lib`; `shell → contracts`; `domain → lib + contracts + ui + common`. Every edge in this list is enforced by an eslint `no-restricted-imports` zone in `eslint.config.js` (lib, ui, contracts, shell, common, domain), as is the intra-domain rule: imports inside `src/core/domain/**` are relative — `@core/domain/*` there fails lint.
- `contracts/` names no registry, no domain, no `common/` store: extension contexts (`ToolRuntimeContext`, `ModuleContext` in `contracts/extension/context.ts`) are typed by contracts-declared ports.
- **RootStore is the single access point**: `StoreRegistry` composes two slices in `src/core/store-registry.ts` — `CommonRegistry` (technical stores) and `DomainRegistry` (domain stores) — plus the `toolContext` / `moduleContext` the composition root assembles over them. Common stores receive `CommonRegistry`; domain stores receive the full `StoreRegistry`. Inter-store links go through it; cross-domain edges are consumer-owned ports in `contracts` (`LayerSnapshotSource`/`RenderErrorSink` for map → tree; `ProtocolRegistry`/`SourceAdapterFactory` for tree → protocols). A port and its domain implementation deliberately share the name; the implementation file imports the port aliased as `…Port` (`ProtocolRegistry`, `SourceAdapterFactory` precedents). Narrow store constructors are NOT used.
- Extensions (`widgets/`, `layer-tools/`, `map-tools/`, `modules/`) import shared types from `@core/contracts`; importing `app` is forbidden (enforced by eslint `no-restricted-imports`). Modules and map-tool panels receive declared-points contexts (`ModuleContext` / `ToolRuntimeContext`), never the full registry.
- Registration is explicit: per-kind functions (`registerWidgets`, `registerTools`, `registerMapTools`, `registerBasemaps`, `registerProtocols`, `registerModules`) call store registries directly, invoked in a visible sequence by the app bootstrap. No manifest, no hidden dispatch. Registries throw on duplicate ids unless `{ override: true }` (ADR-0005); the default source type is assembly policy (`src/app/appConfig.ts`).
- Core never imports from `src/widgets/`, `src/layer-tools/`, `src/map-tools/`, `src/modules/`.
- Cross-imports between `widgets/`, `layer-tools/`, `map-tools/` are forbidden.
- Modules MAY depend on other modules: `dependencies: string[]` (informational — documented coupling, no runtime validation) + direct imports; array order is the execution order.
- **Extensibility**: modules register source adapters via `context.sourceAdapterFactory.register(...)` (precedent: STAC) and may register their own protocols via `context.protocolRegistry.register(new MyProtocol(...), opts?)` — base protocols are registered in `app/bootstrap.ts` before modules, so module protocols add on top (or explicitly override). A new protocol reuses a shared render adapter (`@core/domain/protocols/shared`) by data type or carries its own adapter in its own folder (precedent: `copc/adapter`).
- Cross-domain calls go through `contracts` only (no exceptions); `map/` knows nothing about protocols — the overlay is a thin port (`contracts/domain/map-context.ts` — the `OverlayManager` interface), the COPC adapter receives it via the map context. Camera queries live on `MapContext` (ADR-0010).

### Where code goes

Each rule names how it is checked. A rule that cannot be checked is not a rule.

1. **Generic vs domain — move test.** Copy the file into a fresh project with no
   mapdeck imports: if it compiles unchanged, it is `lib/` material; if it needs
   project dependencies (contracts, stores, domain types), it is domain or UI
   material. Domain words in `lib/` are forbidden.
   Check: grep `src/core/lib/**` for domain words.

2. **A domain is named by its subject.** A `domain/` folder names a part of the
   subject area (`layer-tree`, `map`, `protocols`). A domain folder without a domain
   word is a mistake; a thing named after its technology instead of its role is too —
   `point-cloud` is COPC and lives in `domain/protocols/copc/`.
   Check: folder names on review.

3. **The domain skeleton grows with the domain.** A leaf protocol may stay
   a flat descriptor (one module + `index.ts` — the `createSimpleProtocol`
   precedent). The full skeleton — `types.ts` + `logic/` (pure) + `stores/`
   (MobX) + `index.ts`, `adapters/` when the domain implements ports — is
   mandatory from the moment the domain grows: a store appears, or more
   than a couple of modules. `protocols/` is the one grown domain without a
   root `types.ts` by design: types shared across protocols live in
   `contracts` (`FeatureRow`), per-protocol configs in their own folders.
   Outside the domain only `index.ts` is visible
   either way; the one exception is the composition root (`src/app`), which
   may reach a domain's registration modules (the `registerProtocols`
   precedent) — registration is assembly addressed to the root, not barrel
   surface for everyone.
   Check: folder listing; imports of domain internals on review.

4. **Ports and adapters.** External systems (deck.gl, MapLibre, STAC)
   sit behind ports in `contracts`: the kernel knows the interface, the domain
   provides the implementation, wiring happens in `app/bootstrap`.
   Check: review — an external import that bypasses a port.

5. **The kernel does not assemble itself.** Composition root (`RootStore`,
   `bootstrap`) lives in `src/app/`; the kernel knows the assembly only through the
   `StoreRegistry` interface.
   Check: `no-restricted-imports` bans app imports from extensions; core → app on review.

6. **A folder does not mix generic and domain.** Domain-specific UI lives with its
   domain or its extension (`widgets/`, `map-tools/`, `layer-tools/`), never in the
   generic kit (`core/ui`); the generic kit does not know stores or domains.
   Check: review.

7. **Minimal contract kernel.** `contracts/` holds only types with ≥2 consumers; a
   single-consumer type stays in its domain.
   Check: consumer count on review.

8. **Verifiability.** A rule that cannot be checked is not a rule: `no-restricted-imports`,
   tsc, or a unit test where possible; otherwise stated unambiguously and checked on review.
   Check: every rule in this file names its check.

---

## Code Quality

### Simplicity

- **Max 6 entities per function** (parameters + local variables + return values). Extract if exceeded.
- No premature abstractions. Implement only what the task explicitly requires (YAGNI).
- One component / store / hook = one clear purpose (SRP).
- **Linter limits drive decomposition, not workarounds.** When the linter reports a limit violation (complexity, size, etc.), split the offending function or component into logical parts (hook, presentational component, helper) along responsibility boundaries. NEVER extract code merely to satisfy the linter, and NEVER disable the rule — if the code is too complex, decompose it; the rule should pass naturally.

### Comments

- Inline comments are allowed **only** to explain non-obvious architectural constraints
  that cannot be expressed in the code itself. They MUST state WHY, not WHAT.
- Business logic comments are forbidden — rewrite the code instead.
- **Docstrings** on exported symbols: required — see Documentation policy above.
- `TODO` is forbidden — deferred follow-ups are recorded in the session plan, not in code.

### Type Safety

- Zero `any`; explicit interfaces and generics everywhere.

---

## Boundaries

### Always

- Follow the workflow: plan → implement → ADR check → gate.
- Cite file paths when reusing or adapting existing code.

### Ask First

- Modifying public interfaces, API contracts, or store schemas.
- Adding external dependencies to `package.json`.
- Changing build, linter, TSConfig, or CI/CD configuration.
- Refactoring `core/` or highly coupled modules.

### Never

- Commit a task plan or other working artifacts.
- Duplicate logic without explicit justification.
- Use framework state hooks for business data.
- Write inline comments to explain business logic instead of clearer code.
- Leave `TODO`s in code — record deferred work in the session plan.
