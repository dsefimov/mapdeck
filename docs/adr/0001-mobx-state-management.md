# ADR-0001: MobX as state management

Status: Accepted · Date: 2026-09-22

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
  callback — is flagged at runtime with a `[MobX]` console warning.
- `computedRequiresReaction: true` — reading a computed outside a reactive context warns
  at runtime. The warning matters because the read loses the computed's cache: an
  uncached computed is recomputed on every read.
- `safeDescriptors: true` — guards against accidental redefinition of observable properties.

Components are wrapped in `observer()` and read observables; MobX tracks dependencies and
re-renders only the affected components. No selector memoization, no dispatch boilerplate.

Why not the alternatives: plain React state couples business state to the component
lifecycle — state is lost on unmount — and has no fine-grained dependency tracking
across widgets. Redux Toolkit adds action/reducer/dispatch boilerplate for the many
fine-grained updates this app makes. Zustand and Jotai target component-level state;
this app's global stores (~10, with cross-store dependencies) rely on action
enforcement and a disposal contract, and those the application implements itself —
MobX's observable model fits the store architecture directly.

Async convention: async methods are `@action`; mutations after `await` are wrapped in
`runInAction()` because the `await` leaves the action context. MobX `flow` is an accepted
alternative (used by `RootStore.initialize`); `@action` + `runInAction` is recommended for
new code.

Reaction hygiene: every `reaction()`/`autorun()` in a store stores its disposer, passes a
`name` for devtools debugging, and releases it in the store's `dispose()`. Unnamed reactions
are invisible in devtools; undisposed ones keep firing on stale observables after the store
is discarded.

## Consequences

- Mutating an observable outside an action warns at runtime — async code must wrap
  post-`await` mutations in `runInAction()`.
- Reading a computed outside a reactive context (e.g. `console.log`) warns — debugging
  reads need `autorun()`. The same applies to unit tests that read computeds: they wrap the
  read in `autorun()` or go through `@action` contexts. This is the most likely place for
  future friction; it is the price of the guard.
- The strict config applies in production too; violations surface as loud `[MobX]`
  console warnings rather than failing silently.
- The configuration is global: `mobx` is a host-singleton peer (ADR-0019), so an
  embed applies these options to every MobX store on the page, not only to its own.
