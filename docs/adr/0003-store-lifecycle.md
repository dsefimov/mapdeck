# ADR-0003: Store lifecycle — initialization, async state, disposal

Status: Accepted · Date: 2026-09-22

## Context

Stores run async operations (tree fetch, basemap health checks) and acquire resources
(reactions, abort controllers, listeners). The app needs one observable initialization
gate. None of these contracts are visible from interfaces — `isInitialized`/`initError`
exist only as `RootStore` fields — so they are recorded here.

## Decision

**Initialization contract.** `RootStore` exposes `isInitialized: boolean` and
`initError: string | null`. `initialize()` clears the previous error, initializes the tree
adapter, refreshes the tree, and only then sets `isInitialized = true`; on failure it stores
the message and leaves `isInitialized` false. Components observe exactly one of three
states — initializing (`isInitialized` false, `initError` null), error (`initError` set),
or initialized (`isInitialized` true) — never an intermediate value. The root component
(`MapdeckRoot`) maps them to LoadingScreen / ErrorScreen (with retry) / MapWorkspace. Why: one gate prevents
rendering against a partially assembled store graph. Why observable fields and not a
ready promise: the three states are read synchronously by the render path, and a
promise hides the error state from it.

**Async operation state.** Async operation state uses `AsyncState` / `KeyedAsyncState`
from `src/core/common/state/` (the MobX-flavored primitives; the plain async
utilities live in `lib/async/`): statuses idle/loading/error, per-key isolation, an aggregate
loading query, cancellation via `AbortSignal` (settles at `idle`, no error), and a
generation counter so superseded runs cannot clobber newer state. New code does not
hand-roll `isLoading`/`error` fields — the primitives' semantics are the contract.

**Disposal contract.** A store that acquires resources (reactions, `AbortController`s,
event listeners, external references) exposes `dispose()` that releases them; calling it
twice is safe. `RootStore.dispose()` disposes all stores in reverse construction order,
and reaches keyed instance state: a `StateStore` entry that acquires resources (a tool
controller, a tech-layer store) is disposed with the graph, so a restart does not leave
instance state subscribed to singletons outside it. Stores never call `dispose()` on
siblings. Why: undisposed reactions keep firing on stale observables, and undisposed
abort controllers leak in-flight requests.

## Consequences

- `RootStore.dispose()` disposes every store that has resources in reverse construction
  order; `StateStore`'s keyed entries carry the contract into instance state, while
  stores without resources (e.g. `SettingsStore`) need no
  `dispose()` — the contract applies to stores that acquire resources.

