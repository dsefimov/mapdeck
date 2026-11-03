# ADR-0002: Store composition — the RootStore registry

Status: Accepted · Date: 2026-09-22

## Context

The app has ~10 global stores with dependencies among them (e.g. basemap → settings + map;
widget → locale + settings + state), plus per-instance state for widgets and tools.
The options: one React Context per store, a DI container, or a single root store.

## Decision

A single `RootStore` (`src/app/rootStore.ts`) implements `StoreRegistry`
(`src/core/store-registry.ts` = `CommonRegistry` + `DomainRegistry`) and instantiates all
global stores in its constructor in dependency order. Every store receives `rootStore`
through constructor injection and accesses siblings only through it — store classes never
import each other. This follows the root-store pattern recommended by the MobX docs
(https://mobx.js.org/defining-data-stores.html): a root store instantiates every store
and hands each the references it needs.

`StoreRegistry` is assembled from two halves: `CommonRegistry`, declared next to the
technical stores in `common/`, and `DomainRegistry`, declared next to the domain stores in
`domain/`. Each layer owns its registry surface, so adding a store touches only its own
layer's registry, and the halves meet only in `StoreRegistry` (and its `RootStore`
implementation). The split keeps the registry interface from growing into one centrally
maintained whole.

**Cross-domain edges are consumer-owned ports.** A domain consuming another domain
declares the minimal port it needs (in `contracts/`) and receives it at wiring time;
the registry itself stays concrete — it serves the app UI and same-domain access. The
declared edges today: map → layer-tree (`LayerSnapshotSource`, `RenderErrorSink`)
and layer-tree → protocols (`ProtocolRegistry`, `SourceAdapterFactory`). The
rule bounds the reachability trade-off recorded below: reachability inside the graph may
be total, but cross-domain coupling is visible in `contracts/` and survives internal
refactorings. A new cross-domain read starts a new port at its consumer — never a
wider registry member. Extension contexts (ADR-0004) are assembled from ports the
same way, so `contracts/` never names the registry or a domain.

Why not:

- **React Context per store** — deep provider nesting; dependencies hidden behind context
  resolution instead of being explicit in one constructor.
- **DI container (Inversify, TSyringe)** — an extra dependency and configuration overhead;
  manual instantiation is explicit, debuggable, zero-cost.

State placement has four cases:

1. Shared by ≥2 consumers → global store in `RootStore`.
2. Scoped to one widget/tool instance and must survive close/open or deactivate/activate
   → `stateStore.get(instanceId, factory)`; the factory constructs a controller —
   core code receives `rootStore`, an extension constructs from its declared context.
3. Fully derived from global stores → no local store; the component reads globals through
   `observer()` (precedent: `src/widgets/map-toolbar`).
4. Transient UI trivia (hover, focus, animation, popups) → local React state.

Interaction orchestration — event wiring, keyboard-driven state machines, async tool
pipelines — is case-2 state: a controller class obtained through `stateStore`, with the
component as a thin `observer()` over it (ADR-0008).

Instance state lives in `StateStore` (`src/core/lib/state/StateStore.ts`): a plain keyed
container with get-or-create `get(key, factory)`, `remove(key)` (the explicit reset hook)
and `has(key)`. It imposes no observability — whether a value is observable is the value's
own choice — and holds state in memory only; persistence is a deliberate non-goal.

## Consequences

- Any store can reach any other store — spaghetti risk if unchecked. The no-direct-imports
  rule does not reduce reachability (rootStore-mediated access reaches everything); it makes
  the dependency graph explicit in one place — the `RootStore` constructor. This is the
  deliberately accepted trade-off of the pattern, bounded by the cross-domain port rule
  above. Revisit signal: an undeclared cross-domain edge — a domain reading another
  domain's store without a port in `contracts/` — or a store's dependency list that
  stops being explicit at a glance; then split registries per bounded context, keeping
  the registry composition contract.
- Each store excludes the injected `rootStore` field from observability
  (`makeAutoObservable(this, { rootStore: false })`) — the reference itself is plain; the
  instances it points to are already observable. `RootStore`'s own fields (`isInitialized`,
  `initError`) are observable — they are the initialization gate the App component tracks.
- All global stores are created eagerly at startup. Simpler lifecycle; acceptable at the
  current store count.

