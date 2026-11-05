# ADR-0002: Store composition

Status: Accepted · Date: 2026-09-22

## Context

The application has ~10 global stores with dependencies among them (for example
basemap → settings + map; widget → locale + settings + state), plus per-instance state
for widgets and tools. Two problems need one answer: the stores' construction order and
wiring, and where a component finds the stores it reads. The options considered: one
React Context per store, a DI container, or a single root store.

## Decision

A single `RootStore` (`src/app/rootStore.ts`) implements `StoreRegistry`
(`src/core/store-registry.ts`) and instantiates all global stores in its constructor in
dependency order. Every store receives `rootStore` through constructor injection and
accesses siblings through it; store classes do not import each other. This follows the
root-store pattern recommended by the MobX docs
(https://mobx.js.org/defining-data-stores.html): a root store instantiates every store
and hands each the references it needs.

`StoreRegistry` is assembled from two parts: `CommonRegistry`, declared next to the
technical stores in `common/`, and `DomainRegistry`, declared next to the domain stores
in `domain/`. Each layer owns its registry surface, so adding a store touches only its
own layer's registry; the parts meet in `StoreRegistry` and its `RootStore`
implementation.

**Cross-domain edges are consumer-owned ports.** A domain consuming another domain
declares the minimal port it needs (in `contracts/`) and receives it at wiring time;
the registry itself stays concrete and serves the application UI and same-domain access.
The declared edges today: map → layer-tree (`LayerSnapshotSource`, `RenderErrorSink`)
and layer-tree → protocols (`ProtocolRegistry`, `SourceAdapterFactory`). Cross-domain
coupling is visible in `contracts/` and survives internal refactorings; a new
cross-domain read starts a new port at its consumer rather than a wider registry member.
Extension contexts (ADR-0004) are assembled from ports the same way, so `contracts/`
does not name the registry or a domain.

Alternatives considered:

- **React Context per store** — deep provider nesting; dependencies hidden behind context
  resolution instead of explicit in one constructor.
- **DI container (Inversify, TSyringe)** — an extra dependency and configuration
  overhead; manual instantiation is explicit and debuggable.

State placement has four cases:

1. Shared by two or more consumers → global store in `RootStore`.
2. Scoped to one widget/tool instance and must survive close/open or deactivate/activate
   → `stateStore.get(instanceId, factory)`; the factory constructs a controller — core
   code receives `rootStore`, an extension constructs from its declared context.
3. Derived from global stores → no local store; the component reads globals through
   `observer()` (precedent: `src/widgets/map-toolbar`).
4. Transient UI state (hover, focus, animation, popups) → local React state.

Interaction orchestration — event wiring, keyboard-driven state machines, async tool
pipelines — is case-2 state: a controller class obtained through `stateStore`, with the
component rendering it (ADR-0008).

Instance state lives in `StateStore` (`src/core/lib/state/StateStore.ts`): a keyed
container with get-or-create `get(key, factory)`, `remove(key)` and `has(key)`. It
imposes no observability — whether a value is observable is the value's own choice — and
holds state in memory only; persistence is not a goal.

## Consequences

- Any store can reach any other store through the registry. Accepted trade-off:
  reachability inside the graph is broad, but the dependency graph stays explicit in one
  place — the `RootStore` constructor — and cross-domain coupling is bounded by the port
  rule above. Revisit signal: a domain reading another domain's store without a port in
  `contracts/`, or a store's dependency list that is no longer readable at a glance;
  then split the registries per bounded context, keeping the composition contract.
- Each store excludes the injected `rootStore` field from observability
  (`makeAutoObservable(this, { rootStore: false })`); `RootStore`'s own fields
  (`isInitialized`, `initError`) are observable — they are the initialization gate the
  root component tracks (ADR-0003).
- All global stores are created eagerly at startup; acceptable at the current store
  count.
