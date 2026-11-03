# Architecture

Mapdeck is a browser-based geospatial constructor: a kernel — the map, the layer
tree, and the built-in protocols, streamed point clouds included — that renders
external data sources on a map, with additional functionality delivered as
extensions. The built-in extensions live in this
repository; external developers deliver domain extensions the same way, as modules.

This document is an overview: it explains the "why" and the context that code cannot
express. Tests are colocated with what they test (`*.test.ts` next to the
module); behavior rules live in the pure logic modules and their tests — the ADRs
record why the rules exist. The reading
order is in the README. This document describes the structure and points to them.

## Product context

Mapdeck is a constructor for geoportals, not a single application: each deployment is
assembled from modules over a stable base. The base is the built-in set shipped in this
repository; the module is the unit of delivery for everything on top — data sources,
protocols, widgets, tools. The product reads geodata and never writes back, so the data
flow is one-way: external sources → layer tree → rendering → inspection; measurements
are client-side computations, not records. The architectural promise the rest of these
documents keep: a module can extend or replace behavior at any point of the application
through declared extension points (ADR-0004) and never by reading kernel internals;
a capability without a point means a missing point, and the fix is to add the point.

## The layered kernel

The kernel (`src/core/`) is five layers plus the `shell/` DI glue; the composition
root in `src/app/` assembles it and sits outside the kernel. Each
layer has one dependency direction, and the import rules are enforced by lint rules
recorded in `AGENTS.md`.

- `lib/` — technical primitives with no domain words and no React: pure async
  utilities, registries, the keyed state container, logging, text, color, pure geo
  math. It imports no framework, no state library, no upper layer; external
  packages are an ADR-gated exception (ADR-0020).
- `common/` — technical subsystems reusable outside the geo domain: locale (i18n),
  settings, the widget system (catalog and grid layout state), and the MobX-flavored
  async-state primitives. Their stores receive only the technical slice of the
  registry, without domain knowledge.
- `ui/` — the generic React kit: components, composites, hooks, icons, theme,
  utils. It imports `lib` (plus `mobx-react-lite` for the WidgetGrid precedent
  alone) — the kit knows no stores and no domains;
  consumers inject state through structural props (the WidgetGrid precedent).
- `contracts/` — ports and the shared kernel: the types that two or more consumers
  need, and the interfaces external systems sit behind (deck.gl, MapLibre, STAC).
  Domain code talks to the outside world through these ports.
- `shell/` — the DI glue: `StoreProvider` and `useRootStore`, the only way a React
  tree reaches the store graph.
- `domain/` — the bounded contexts: `layer-tree`, `map`, and `protocols` (one folder
  per data protocol: wms, xyz, cog, copc, vector-tile, geojson-tiled, wfs,
  ogc-features). The skeleton grows with the domain: a leaf protocol may stay a flat
  descriptor (one module + `index.ts`, the `createSimpleProtocol` precedent), while a
  grown domain carries `types.ts`, pure `logic/`, MobX `stores/`, and an `index.ts` as
  its only public surface; `adapters/` appears when the domain implements a port.

Dependencies point one way; the full edge list and the diagram live in
[AGENTS.md](../AGENTS.md) (Dependency Graph), enforced by the lint zones recorded
there.

## One store graph

All application state hangs off one object. `RootStore` (`src/app/rootStore.ts`)
implements `StoreRegistry` (`src/core/store-registry.ts`) — the composition of two
halves: `CommonRegistry` (the technical stores, declared in `common/`) and
`DomainRegistry` (the domain stores, declared in `domain/`). Every store receives the
registry through its constructor and reaches siblings only through it; store classes
never import each other. The rationale and the accepted trade-offs are recorded in
ADR-0002. Cross-domain edges are declared ports in `contracts/` — today the map
domain's reads of the layer tree (`LayerSnapshotSource`, `RenderErrorSink`) — and the
composition root assembles two declared-points contexts over the graph: `toolContext`
(the runtime slice panels receive, ADR-0006) and `moduleContext` (registration plus
runtime, ADR-0004).

The MobX conventions — what is observable, how derivations and async state are
expressed — are ADR-0001; the initialization gate, async operation state and the
disposal contract are ADR-0003. Per-instance state that must survive close/open
cycles lives in `StateStore`, keyed by the owning widget or tool; the state placement
rule is in ADR-0002. Layer-tree presentation state (expansion, menus, search) lives
in a view model obtained the same way; the split between domain and presentation
state is ADR-0008.

## Extensions

Domain-specific functionality arrives as extensions of four kinds: widgets, layer
tools, map tools, and modules. All four share one shape — an object implementing
its contract interface, a class when it needs observable state or lifecycle — and each
kind has its own home store for identity and activation. The model and its rationale
are ADR-0004; the registration mechanics are ADR-0005. Registration is explicit: each
kind has one registration function, and the composition root runs them in a fixed
sequence — protocols before modules, so a module's protocols add on top of the base
set (or replace one explicitly via `{ override: true }`) — and only then initializes
the root store. The default source type is assembly policy — a facade option
(`MapdeckOptions.defaultSourceType`) with a built-in fallback to the STAC adapter;
the demo names an empty value, keeping the must-be-configured contract, and an
unregistered type fails initialization visibly.

Modules register through a declared-points context (`ModuleContext`, ADR-0004): the
registration surfaces for every extension kind — source adapters, protocols, feature
providers, basemaps, widgets, both tool kinds, tool-to-protocol links, settings,
translations and the kernel's asset mapping — plus the runtime services and read
ports (state, locale, protocol and
feature-provider reads, the tree catalog, basemap read-and-switch). A module never
receives the domain stores; it changes kernel behavior through the points alone
(ADR-0004). Map-tool
panels receive the runtime slice of the same family (`ToolRuntimeContext`,
ADR-0006) together with the map engine — platform technology for tools, not a port.

Widgets are panels registered in the widget catalog (the built-in set: attribute
table, layer tree, map toolbar, map viewer, settings, sidebar). The map viewer and
the sidebar render as static workspace chrome outside the window grid; the window
model — what
survives closing, how the z-order is bounded — is recorded in ADR-0004. Layer tools
are the per-node actions in the tree's "More" menu (attribute table, opacity, point
size and color controls); how a tool becomes available on a node is ADR-0007. Map
tools are the toolbar's buttons over the map (measurements, basemap, feature
inspection, orientation reset); one contract with two invocation modes is ADR-0006.
Modules package any combination of the above plus source adapters and protocols; the
built-in example is `src/modules/stac`, which delivers the STAC catalog integration.
Module-to-module coupling is documented via `dependencies` and executed in array
order; the trade-offs are in ADR-0004.

## From source to pixels

The central flow: a source adapter turns an external source into a layer tree; the
tree's snapshot resolves into descriptors; the layer manager syncs them onto two
render backends.

**The source.** The `SourceAdapter` port (`fetchRoot`/`fetchChildren`) is the tree's
only way to data; the adapter is chosen from the configured source type and
re-initialized when the source URL changes (ADR-0008). Assets reach their protocol
bindings through the kernel's asset mapping (ADR-0018): priority-ordered rules claim
each asset, a protocol's slot fitness picks the serving slot, and the adapter builds
nodes from the assignments, attaching capabilities (which layer tools apply). A
protocol only defines how data is requested; the kernel provides the vocabulary,
verifies every assignment, and derives the menu. That boundary is ADR-0009.

**The tree.** `LayerTreeStore` holds nodes in observable maps behind a `TreeState`
interface; every rule — reconciliation, user-state preservation, the visibility
cascade, search, snapshots — is a pure operation in `domain/layer-tree/logic/`, and
the store only applies their results (ADR-0008). Children load lazily through one
path, because hierarchies can be arbitrarily deep.

**The snapshot.** `layerSnapshot` collects the layer nodes and resolves them through
the protocol registry into descriptors; it is compared by structural equality, so the
map reacts only to content that actually changed. It is the map's single signal
(ADR-0008).

**The sync loop.** The layer manager turns the snapshot into render units — one unit
per node, grouped by the protocol's own grouping hook — and on every snapshot change
classifies the difference and applies it in a fixed order, so a visibility toggle
never tears down a loaded layer (ADR-0010).

**Two backends.** Raster and vector protocols draw native MapLibre layers through
their `LayerAdapter`s; the `OverlayManager` port — a thin interface whose only
implementation wraps deck.gl — serves the other layer types: the COPC point clouds,
the GeoJSON layers and the map tools' measurement and marker layers all draw through
it. The map domain imports no protocol code; its deck.gl surface is the overlay
adapter behind the domain's barrel (the manager and the tech-layer renderer), and
adapters receive a `MapContext` at each call. The port, the handoff and the
failure channels are ADR-0010.

**The streaming engine.** COPC point clouds are the only streamed format. The engine
inside `domain/protocols/copc/engine/` runs a cycle — select, plan, evict, load,
render — bounded by a point budget, and packs the result into a single deck layer
updated in place. The whole machinery is invisible outside the protocol (ADR-0011).

## Where things live

| Path | Contents |
|---|---|
| `src/core/lib` | technical primitives (the folder list lives in AGENTS.md, Core Structure) |
| `src/core/common` | locale, settings, widget system, `state` — MobX-flavored async state (`AsyncState`, `KeyedAsyncState`) |
| `src/core/ui` | generic React kit |
| `src/core/contracts` | ports and shared types |
| `src/core/shell` | `StoreProvider`, `useRootStore` |
| `src/core/domain` | `layer-tree`, `map`, `protocols` (per-protocol folders plus the cross-protocol `logic/`, `shared/`, `stores/`) |
| `src/core/store-registry.ts`, `src/core/domain/domain-registry.ts` | `StoreRegistry` composition and its domain half |
| `src/app` | `RootStore`, bootstrap, the embed facade, `MapdeckRoot` (global error handlers are demo-only) |
| `src/widgets`, `src/layer-tools`, `src/map-tools` | built-in extensions |
| `src/modules` | domain modules (`stac`) |
| `docs/adr`, `docs/glossary.md` | decisions and terms |
| `docs/extending.md` | how-to for extension modules |

## Error channels

The principle: every failure surfaces on the thing it belongs to. Render-unit
failures report per node through `reportRenderError`, so the tree never silently
diverges from the map; React failures are contained by an `ErrorBoundary` at each
level (workspace, widget window), recovery remounts the smallest scope; protocol
HTTP throws with named, actionable messages; best-effort paths (report download,
recolor, picking fallback) degrade quietly, with a comment at each site stating
why. The kernel installs no global handlers — the host owns
`window.onerror`/`unhandledrejection`.

## Decisions

Non-obvious decisions and their rationale are in [docs/adr/](adr/).
