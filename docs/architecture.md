# Architecture

Mapdeck is a browser-based geospatial application framework for building configurable
geoportals: map rendering, layer management, data access, and an extension system. The
core (`src/core/`) implements the framework; `src/app/` composes it into the application
and the embeddable package; extensions (`src/widgets`, `src/layer-tools`, `src/map-tools`,
`src/modules`) add functionality.

This document describes the main architectural components, their responsibilities
and dependencies. Decisions and their rationale are in [docs/adr/](adr/); domain
terms in [docs/glossary.md](glossary.md); the public extension surfaces in
[docs/extending.md](extending.md) and [docs/api/](api/).

## Product context

Mapdeck is a framework for geoportals, not a single application: each deployment is
assembled from modules over a stable base. Mapdeck reads geodata and provides no
editing or write-back, so data flows one way: external sources → layer tree → rendering
→ inspection; measurements are client-side computations. Modules extend the application
through the interfaces of `ModuleContext` (ADR-0004) and do not access internal stores.

## Core components

- `lib/` — pure technical primitives: async utilities, registries, the keyed state
  container, logging, text, color, geo math, structural equality, URL parsing. No
  framework imports (ADR-0020).
- `common/` — technical subsystems reusable without geo coupling: locale (i18n),
  settings, the widget system, and the MobX-based async state (`AsyncState`,
  `KeyedAsyncState` in `common/state`; the plain async utilities stay in `lib/async`).
- `ui/` — generic React components, composites, hooks, icons, theme. The kit has no
  stores and no domain knowledge; the composition root feeds the widget grid its
  state through props.
- `contracts/` — shared types and ports: the extension-context family
  (`ModuleContext`, `ToolRuntimeContext`) and the interfaces external systems sit
  behind (deck.gl, MapLibre, STAC).
- `shell/` — the store provider: `StoreProvider` and `useRootStore`, the way a React
  tree reaches the store graph.
- `domain/` — bounded contexts: `layer-tree`, `map`, and `protocols` (one folder per
  data protocol). A domain carries `types.ts`, pure `logic/`, MobX `stores/`, and an
  `index.ts` as its public surface; `adapters/` appears when it implements a port.

## Dependency structure

Dependencies point one way, and the ESLint zones in `eslint.config.js` enforce them;
the complete edge list lives there. The composition root (`src/app/`) creates and
configures the core. Extensions import shared types from `@core/contracts`, not from
`src/app` and not from each other; the core does not import from the extension folders.
Cross-domain communication goes through interfaces in `contracts/` — for example, the
map domain reads the layer tree through `LayerSnapshotSource` and `RenderErrorSink`,
and the tree reaches protocols through `ProtocolRegistry` and `SourceAdapterFactory`.

## Store architecture

`RootStore` (`src/app/rootStore.ts`) provides access to the application's global
stores through `StoreRegistry` (`src/core/store-registry.ts`), the composition of
`CommonRegistry` and `DomainRegistry`. Every store receives the registry through its
constructor and reaches siblings through it; store classes do not import each other
(ADR-0002). The MobX conventions are in ADR-0001; the initialization gate, async
operation state and disposal are in ADR-0003.

## Extension architecture

Domain functionality is provided by extensions of three kinds, delivered as modules —
the composition unit that packages any combination of them plus source adapters and
protocols:

- **Widgets** — panels in the workspace grid; layout and z-order persist for the
  session (ADR-0004). The map viewer and the sidebar are widgets too, but render as
  static workspace chrome outside the grid.
- **Layer tools** — per-node actions in the tree's "More" menu (ADR-0007).
- **Map tools** — toolbar buttons over the map: one-shot actions or interactive tools
  with a panel (ADR-0006).

Registration is explicit and per kind; the composition root runs it in a fixed
sequence — built-ins first, modules last (a module may replace a built-in registration
with an explicit override), then the layer-tree fetch ([docs/extending.md](extending.md),
ADR-0005). Modules and map-tool panels receive contexts (`ModuleContext`,
`ToolRuntimeContext`), not the store registry; the built-in example of a module is
`src/modules/stac` (the STAC catalog integration).

## Data flow and rendering pipeline

Data flows through the following components: a source adapter creates the layer tree,
the snapshot resolves layer configurations into render descriptors, and the layer
manager updates the rendering backends.

1. **Source.** The `SourceAdapter` port (`fetchRoot`/`fetchChildren`) is the tree's
   only way to the data. The source adapter classifies its assets; priority-ordered
   rules claim each asset, and slot fitness picks the binding (ADR-0018). The boundary
   between source, protocol and core is ADR-0009.
2. **Layer tree.** `LayerTreeStore` holds nodes in observable maps; the domain
   operations — reconciliation, visibility, search, snapshot building — are pure
   functions in `domain/layer-tree/logic/` (ADR-0008). Children load lazily, because
   hierarchies can be arbitrarily deep.
3. **Snapshot.** `layerSnapshot` collects the layer nodes and resolves them through
   the protocol registry into descriptors; the map reacts only when render-relevant
   content changes (ADR-0010).
4. **Sync.** The layer manager turns the snapshot into render units — one per visible
   node, batched by the protocol's optional grouping hook — and applies the difference
   to the backends (ADR-0010).
5. **Backends.** Raster and vector protocols draw native MapLibre layers through their
   `LayerAdapter`s. Everything else — point clouds, GeoJSON overlays, measurement
   layers — draws through the `OverlayManager` port, implemented today by a deck.gl
   wrapper (ADR-0010).

COPC point clouds are the only streamed format; the streaming engine is encapsulated
within the COPC protocol module (ADR-0011).

## Error handling

- Initialization failures (registration errors, invalid configuration, a failed first
  source fetch) set `initError`; the root component renders an error screen with a
  retry that re-runs the bootstrap on a fresh store (ADR-0003,
  [docs/api/lifecycle.md](api/lifecycle.md)).
- Source and attribute-loading failures surface through the keyed async state of the
  operation: the widget shows its loading and error states.
- Render-unit failures report per node through `reportRenderError`; the tree row shows
  the error, and the layer manager retries with a gate (ADR-0010).
- React failures are contained by error boundaries at the workspace and widget level;
  recovery remounts the smallest scope.
- Protocol HTTP errors throw with actionable messages ("WFS GetFeature returned 404
  Not Found").
- Best-effort paths (report download, point-cloud recolor, picking fallback) degrade
  quietly, with a comment at each site.

The library installs no global handlers — the host owns
`window.onerror`/`unhandledrejection`.

## Source code organization

| Path | Contents |
|---|---|
| `src/core/lib` | technical primitives |
| `src/core/common` | locale, settings, widget system, async state |
| `src/core/ui` | generic React kit |
| `src/core/contracts` | ports and shared types |
| `src/core/shell` | `StoreProvider`, `useRootStore` |
| `src/core/domain` | `layer-tree`, `map`, `protocols` |
| `src/core/store-registry.ts`, `src/core/domain/domain-registry.ts` | `StoreRegistry` and its domain half |
| `src/app` | `RootStore`, bootstrap, the embed facade, `MapdeckRoot` |
| `src/widgets`, `src/layer-tools`, `src/map-tools` | built-in extensions |
| `src/modules` | domain modules (`stac`) |
