# ADR-0001: MobX as state management

## Context

A TypeScript SPA (deck.gl + MapLibre map portal) needs state management for fine-grained
observable updates: layer configs, visibility toggles, tool state, settings. Business state
must live outside React components — it must survive component mount/unmount, stay testable,
and be shared across widgets and tools. React hooks (`useState` and friends) are reserved
for UI trivia.

## Decision

Use MobX as the single state-management library, with strict runtime configuration
(`src/app/mobxConfig.ts`):

- `enforceActions: "always"` — observable mutations are allowed only inside `@action`
  methods or `runInAction()`. The most common MobX bug — mutating an observable in an async
  callback — fails immediately at runtime.
- `computedRequiresReaction: true` — reading a computed outside a reactive context throws
  instead of silently returning a stale value.
- `safeDescriptors: true` — guards against accidental redefinition of observable properties.

Components are wrapped in `observer()` and read observables; MobX tracks dependencies and
re-renders only the affected components. No selector memoization, no dispatch boilerplate.

Why not the alternatives:

- **Plain React state** — business state in components couples state lifetime to component
  lifecycle (state is lost on unmount), forces prop-drilling or Context (which re-renders
  every consumer on any change), and has no fine-grained dependency tracking. This is the
  core reason the app does not "just use React".
- **Redux Toolkit** — action/reducer/dispatch boilerplate for the many fine-grained
  observable updates this app has.
- **Zustand** — no action discipline (no `enforceActions` equivalent — direct mutations are
  possible), no lifecycle/dispose contract, and subscriptions go through selectors; none of
  that fits the strict action and lifecycle rules this app relies on.
- **Jotai** — atoms target component-level state, not a global service layer.

Async convention: async methods are `@action`; mutations after `await` are wrapped in
`runInAction()` because the `await` leaves the action context. MobX `flow` is an accepted
alternative (used by `RootStore.initialize`); `@action` + `runInAction` is recommended for
new code.

Reaction hygiene: every `reaction()`/`autorun()` in a store stores its disposer, passes a
`name` for devtools debugging, and releases it in the store's `dispose()`. Unnamed reactions
are invisible in devtools; undisposed ones keep firing on stale observables after the store
is discarded.

## Consequences

- Mutating an observable outside an action throws at runtime — async code must wrap
  post-`await` mutations in `runInAction()`.
- Reading a computed outside a reactive context (e.g. `console.log`) throws — debugging
  reads need `autorun()`. The same applies to unit tests that read computeds: they wrap the
  read in `autorun()` or go through `@action` contexts. This is the most likely place for
  future friction; it is the price of the guard.
- The strict config applies in production too; violations surface as runtime errors,
  not silent staleness.
