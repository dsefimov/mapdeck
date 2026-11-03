# Architecture

Mapdeck is a browser-based geospatial application framework: map rendering, layer
management, data access, and an extension system. The core (`src/core/`) implements
the framework; `src/app/` composes it into the application and the embeddable
package; extensions (`src/widgets`, `src/layer-tools`, `src/map-tools`,
`src/modules`) add functionality.

This document describes the main architectural components, their responsibilities
and dependencies. Decisions and their rationale are in [docs/adr/](adr/); domain
terms in [docs/glossary.md](glossary.md).

## Product context

Mapdeck is a framework for geoportals, not a single application: each deployment is
assembled from modules over a stable base. The product reads geodata and never
writes back, so data flows one way: external sources → layer tree → rendering →
inspection; measurements are client-side computations. Modules extend the
application through the interfaces of `ModuleContext` (ADR-0004) and do not access
internal stores; a capability without an interface is a request for a new
interface, not a reason to reach into internals.

## Core components

- `lib/` — pure technical primitives: async utilities, registries, the keyed state
  container, logging, text, color, geo math, structural equality, URL parsing. No
  framework imports (ADR-0020).
- `common/` — technical subsystems reusable without geo coupling: locale (i18n),
  settings, the widget system, and the MobX-based async state (`AsyncState`,
  `KeyedAsyncState` in `common/state`; the plain async utilities stay in
  `lib/async`).
- `ui/` — generic React components, composites, hooks, icons, theme. The kit has no
  stores and no domain knowledge; the widget grid is its only MobX coupling.
- `contracts/` — shared types and ports: the extension-context family
  (`ModuleContext`, `ToolRuntimeContext`) and the interfaces external systems sit
  behind (deck.gl, MapLibre, STAC).
- `shell/` — the store provider: `StoreProvider` and `useRootStore`, the way a
  React tree reaches the store graph.
- `domain/` — bounded contexts: `layer-tree`, `map`, and `protocols` (one folder
  per data protocol: wms, xyz, cog, copc, vector-tile, geojson-tiled, wfs,
  ogc-features). A domain carries `types.ts`, pure `logic/`, MobX `stores/`, and an
  `index.ts` as its only public surface; `adapters/` appears when it implements a
  port.

## Dependency structure

Dependencies point one way, and the ESLint zones in `eslint.config.js` enforce
them. The composition root (`src/app/`) is responsible for creating and configuring
the core. Extensions import shared types from `@core/contracts`, never from
`src/app` and never from each other; the core never imports from the extension
folders. Cross-domain communication goes through interfaces in `contracts/` — for
example, the map domain reads the layer tree through `LayerSnapshotSource` and
`RenderErrorSink`, and the tree reaches protocols through `ProtocolRegistry` and
`SourceAdapterFactory`.

## Store architecture

All application state lives on one object. `RootStore` (`src/app/rootStore.ts`)
implements `StoreRegistry` (`src/core/store-registry.ts`), the composition of
`CommonRegistry` and `DomainRegistry`. Every store receives the registry through
its constructor and reaches siblings only through it; store classes never import
each other (ADR-0002). The MobX conventions are in ADR-0001; the initialization
gate, async operation state and disposal are in ADR-0003.

## Extension architecture

Domain functionality is provided by extensions of four kinds:

- **Widgets** — panels in the workspace grid; layout and z-order survive closing
  (ADR-0004). The map viewer and the sidebar are widgets too, but render as static
  workspace chrome outside the grid.
- **Layer tools** — per-node actions in the tree's "More" menu (ADR-0007).
- **Map tools** — toolbar buttons over the map: one-shot actions or interactive
  tools with a panel (ADR-0006).
- **Modules** — the unit of delivery, packaging any combination of the above plus
  source adapters and protocols (ADR-0004, ADR-0005).

Registration is explicit and per kind; the composition root runs it in a fixed
sequence — built-ins first, modules last, then the layer-tree fetch. Modules and
map-tool panels receive contexts (`ModuleContext`, `ToolRuntimeContext`), not the
store registry; the built-in example of a module is `src/modules/stac` (the STAC
catalog integration).

## Data flow and rendering pipeline

Data flows through the following components: a source adapter creates the layer
tree, the snapshot resolves layer configurations into render descriptors, and the
layer manager updates the rendering backends.

1. **Source.** The `SourceAdapter` port (`fetchRoot`/`fetchChildren`) is the tree's
   only way to the data. The source adapter classifies its assets; priority-ordered
   rules registered by protocols claim each asset, and slot fitness picks the
   binding (ADR-0018). The boundary between source, protocol and core is ADR-0009.
2. **Layer tree.** `LayerTreeStore` holds nodes in observable maps; reconciliation,
   user-state preservation, the visibility cascade, search and snapshot building
   are pure operations in `domain/layer-tree/logic/` (ADR-0008). Children load
   lazily, because hierarchies can be arbitrarily deep.
3. **Snapshot.** `layerSnapshot` collects the layer nodes and resolves them through
   the protocol registry into descriptors. It is compared by structural equality,
   so the map reacts only when render-relevant content changes.
4. **Sync.** The layer manager turns the snapshot into render units — one per node,
   grouped by the protocol's own grouping hook — classifies the difference and
   applies it in a fixed order, so a visibility toggle never rebuilds a layer whose
   backend holds loaded data (ADR-0010).
5. **Backends.** Raster and vector protocols draw native MapLibre layers through
   their `LayerAdapter`s. Everything else — point clouds, GeoJSON overlays,
   measurement layers — draws through the `OverlayManager` port, whose single
   implementation wraps deck.gl. The map domain does not depend on individual data
   protocols; all deck.gl rendering is handled by the overlay adapter
   (ADR-0010).

COPC point clouds are the only streamed format. The engine inside
`domain/protocols/copc/engine/` loads octree nodes on demand within a point budget
and packs the result into a single deck.gl layer; the implementation is
encapsulated within the COPC protocol module (ADR-0011).

## Error handling

Every failure surfaces where it belongs: render-unit failures report per node
through `reportRenderError`, so the tree shows them; React failures are contained
by error boundaries at the workspace and widget level, and recovery remounts the
smallest scope; protocol HTTP errors throw with actionable messages; best-effort
paths (report download, recolor, picking fallback) degrade quietly, with a comment
at each site. The library installs no global handlers — the host owns
`window.onerror`/`unhandledrejection`.

## Source code organization

| Path | Contents |
|---|---|
| `src/core/lib` | technical primitives (folder list in AGENTS.md) |
| `src/core/common` | locale, settings, widget system, async state |
| `src/core/ui` | generic React kit |
| `src/core/contracts` | ports and shared types |
| `src/core/shell` | `StoreProvider`, `useRootStore` |
| `src/core/domain` | `layer-tree`, `map`, `protocols` |
| `src/core/store-registry.ts`, `src/core/domain/domain-registry.ts` | `StoreRegistry` and its domain half |
| `src/app` | `RootStore`, bootstrap, the embed facade, `MapdeckRoot` |
| `src/widgets`, `src/layer-tools`, `src/map-tools` | built-in extensions |
| `src/modules` | domain modules (`stac`) |
