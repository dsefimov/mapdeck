# Architecture

Mapdeck is a browser-based geospatial constructor: a small generic core that renders
external data sources on a map, with domain-specific functionality — protocols,
widgets, tools — delivered as extensions. The built-in extensions live in this
repository; external developers deliver domain extensions the same way, as modules.

This document is an overview, not a source of truth. Code, types, tests and configs
are the source of truth; the documents explain the "why" and the context that code
cannot express. Tests are colocated with what they test (`*.test.ts` next to the
module); behavior rules live in the ADRs and in the pure logic modules. Reading
order: `AGENTS.md` (rules and workflow) → this overview →
`docs/glossary.md` (domain terms) → `docs/adr/` (decisions and their rationale).
This document describes the structure and points to them.

## Product context

Mapdeck is a constructor for geoportals, not a single application: each deployment is
assembled from modules over a stable base. The base is the built-in set shipped in this
repository; the module is the unit of delivery for everything on top — data sources,
protocols, widgets, tools. The product reads geodata and never writes back, so the data
flow is one-way: external sources → layer tree → rendering → inspection; measurements
are client-side computations, not records. The architectural promise the rest of these
documents keep: a module can extend or replace behavior at any point of the application
through declared extension points (ADR-0004) — never by reaching into kernel
internals — and a capability with no extension point is a missing point, not an
invitation to reach in.

## The layered core

The core (`src/core/`) is five layers plus a composition root in `src/app/`. Each
layer has one dependency direction, and the import rules are enforced by lint rules
recorded in `AGENTS.md`.

- `lib/` — technical primitives with no domain words and no React: pure async
  utilities, registries, the keyed state container, logging, text, color, pure geo
  math. It imports nothing — no framework, no state library, no upper layer.
- `common/` — technical subsystems reusable outside the geo domain: locale (i18n),
  settings, the widget system (catalog and grid layout state), and the MobX-flavored
  async-state primitives. Their stores receive only the technical slice of the
  registry, without domain knowledge.
- `ui/` — the generic React kit: components, composites, hooks, icons, theme,
  utils, fonts. It imports `lib` only — the kit knows no stores and no domains;
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

Dependencies point one way: `app → domain → {ui, contracts} → lib`, with `shell` on
the contracts edge, so the deepest layers stay free of React, MobX and the outside
world.

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
tools, map tools, and modules. All four share one shape — a class instance — and each
kind has its own home store for identity and activation. The model and its rationale
are ADR-0004; the registration mechanics are ADR-0005. Registration is explicit: each
kind has one registration function, and the composition root runs them in a fixed
sequence — protocols before modules, so a module's protocols add on top of the base
set (or replace one explicitly via `{ override: true }`) — and only then initializes
the root store. The default source type is assembly policy: `src/app/appConfig.ts`
names it, and a missing or unregistered type fails initialization visibly.

Modules register through a declared-points context (`ModuleContext`, ADR-0004): the
registration surfaces for every extension kind — source adapters, protocols, feature
providers, widgets, both tool kinds, tool-to-protocol links — plus the runtime
services (state, locale, settings, read ports). A module never receives the domain
stores; it changes kernel behavior through the points, and a capability no point
covers is a missing point, not an invitation to reach into internals. Map-tool
panels receive the runtime slice of the same family (`ToolRuntimeContext`,
ADR-0006) together with the map engine — platform technology for tools, not a port.

Widgets are the windowed panels of the workspace (the built-in set: attribute table,
layer tree, map toolbar, map viewer, settings, sidebar); their window model — what
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
re-initialized when the source URL changes (ADR-0008). The source also decides what
each node can do: its protocol bindings (which protocol renders it, which serves its
attributes) and its capabilities (which layer tools apply). A protocol only defines
how data is requested; the core provides the vocabulary, verifies every assignment,
and derives the menu. That boundary is ADR-0009.

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
adapter of ADR-0010 (the manager, the tech-layer renderer behind the domain's
barrel), and adapters receive a
`MapContext` at each call. The port, the handoff and the failure channels are
ADR-0010.

**The streaming engine.** COPC point clouds are the only streamed format. The engine
inside `domain/protocols/copc/engine/` runs a cycle — select, plan, evict, load,
render — bounded by a point budget, and packs the result into a single deck layer
updated in place. The whole machinery is invisible outside the protocol (ADR-0011).

## Where things live

| Path | Contents |
|---|---|
| `src/core/lib` | technical primitives (`async`, `color`, `equality`, `geo`, `logger`, `registry`, `state`, `text`) |
| `src/core/common` | locale, settings, widget system, shared async-state (`state`) |
| `src/core/ui` | generic React kit |
| `src/core/contracts` | ports and shared types |
| `src/core/shell` | `StoreProvider`, `useRootStore` |
| `src/core/domain` | `layer-tree`, `map`, `protocols` (per-protocol folders plus the cross-protocol `logic/`, `shared/`, `stores/`) |
| `src/core/store-registry.ts`, `src/core/domain/domain-registry.ts` | `StoreRegistry` composition and its domain half |
| `src/app` | `RootStore`, bootstrap, MobX config, global error handlers, `App` |
| `src/widgets`, `src/layer-tools`, `src/map-tools` | built-in extensions |
| `src/modules` | domain modules (`stac`) |
| `docs/adr`, `docs/glossary.md` | decisions and terms |

## Error channels

Who logs, who rethrows, who swallows — the matrix the reviews kept asking for:

| Channel | Behavior |
|---|---|
| Global (`window.onerror`, `unhandledrejection`) | logged by the app's handlers — nothing escapes to the bare console |
| Root workspace (`app/ErrorBoundary`) | contained, logged with componentStack, recovery is a page reload |
| One widget (`ui` `ErrorBoundary` in WidgetGrid) | contained to the window, logged with componentStack, recovery remounts the widget |
| Render units (`LayerManager`) | every channel (add/show/hide/update/remove) reports through `reportRenderError`; success clears with `null` — the tree never silently diverges from the map |
| COPC node loads | errored node, eviction-protected, exponential backoff retry; cancellation aborts the request |
| Protocol HTTP (`fetchChecked`, `boundedFetch`, `boundedGetter`) | throws with a named, actionable message; timeouts distinguishable from aborts |
| STAC catalog fetches | throw upward (init/refresh surfaces them); a CORS refusal says so; pagination truncation and enrichment caps warn |
| Basemap apply | health-probed, rolled back on partial failure; probes log through the store |
| Best-effort paths (report download, recolor, picking fallback) | degrade quietly — a comment at each site states why |
| Zoom to extent | user-facing: refusals (no map, invalid bbox) log a warning, fit failures log an error |

## Decisions

Every non-obvious decision and its rationale is an ADR in `docs/adr/`:

| ADR | Title |
|---|---|
| 0001 | MobX as state management |
| 0002 | Store composition — RootStore as service locator |
| 0003 | Store lifecycle — initialization, async state, disposal |
| 0004 | Extension model — one class shape, module as primary container |
| 0005 | Extension registration and initialization |
| 0006 | Map tools — toolbar, one contract, two invocation modes |
| 0007 | Layer tools — protocol-bound actions in the layer tree |
| 0008 | Layer tree — pure operations over a domain model, presentation state apart |
| 0009 | Node capabilities and protocols — the source/protocol/core boundary |
| 0010 | Map rendering — the overlay port and the snapshot-to-map sync loop |
| 0011 | Point-cloud streaming — the COPC engine |
| 0012 | Point-cloud data port at the protocol boundary |
| 0013 | FeatureRow — typed reserved row keys |
| 0014 | Design system policy — CSS Modules + semantic tokens, self-owned interactions |
