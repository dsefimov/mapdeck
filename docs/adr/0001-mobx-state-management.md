# ADR-0001: MobX as state management

Status: Accepted · Date: 2026-09-22

## Context

A TypeScript SPA (deck.gl + MapLibre map portal) needs state management for fine-grained
observable updates: layer configs, visibility toggles, tool state, settings. Business state
must live outside React components — it must survive component mount/unmount, stay testable,
and be shared across widgets and tools. React hooks (`useState` and friends) are reserved
for transient UI state.

## Decision

Use MobX as the state-management library, configured in `src/app/mobxConfig.ts`:

- `enforceActions: "always"` — observable mutations are allowed only inside `@action`
  methods or `runInAction()`.
- `computedRequiresReaction: true` — reading a computed outside a reactive context warns
  at runtime; such a read loses the computed's cache and recomputes on every read.
- `safeDescriptors: true` — guards against accidental redefinition of observable properties.

Components are wrapped in `observer()` and read observables; MobX tracks dependencies and
re-renders the affected components.

Alternatives considered: plain React state couples business state to the component
lifecycle — state is lost on unmount — and has no dependency tracking across widgets.
Redux Toolkit, Zustand and Jotai were set aside: the application's ~10 global stores with
cross-store dependencies and a disposal contract (ADR-0003) map directly onto MobX's
observable model and action enforcement, without adapter layers over the store
composition of ADR-0002.

Conventions: async store methods are `@action`, with post-`await` mutations wrapped in
`runInAction()`; every `reaction()`/`autorun()` in a store carries a `name` for devtools,
and its disposer is released in the store's `dispose()`.

## Consequences

- Violations — mutating an observable outside an action, reading a computed outside a
  reactive context — produce a `[MobX]` console warning in development and in production
  builds; they do not throw. Async code wraps post-`await` mutations in `runInAction()`,
  and unit tests that read computeds wrap the read in `autorun()` or an action.
- The configuration applies to every MobX store on the page, not only to mapdeck's own:
  `mobx` is a host-singleton peer dependency (ADR-0019). Host applications that run their
  own MobX stores inherit these options (see Known limitations in the README).
