# Layer System — Design

## Context

The layer system is the rendering backbone of the portal. It converts tree nodes (data model) into map layers (visual output). Every extension surface — layer tools, map tools, modules, widgets — depends on the contracts defined here. The system sits in the `core` layer and depends on external libraries (MapLibre GL, deck.gl) and the `node-roles` data model.

## Goals / Non-Goals

**Goals:**
- Document the current architecture: types, flow, patterns, and trade-offs
- Provide source file references for every concept
- Identify extension points for module developers

**Non-Goals:**
- Specifying individual adapter implementations (RasterAdapter, VectorAdapter, etc.)
- Changing any runtime behavior or type definitions
- Specifying WMS grouping logic (in `layerSync.ts`)

## Decisions

### LayerRole as branded string

`LayerRole` is a branded string type (`string & { readonly [LayerRoleBrand]: void }`). A plain `string` is not assignable without explicit cast. This prevents accidental mixing of role names with arbitrary strings.

**Alternatives considered**: String enum — rejected because modules need to define roles at runtime (`LayerRoles.of("custom-type")`), which a TypeScript enum cannot support without declaration merging tricks. Plain string — rejected because it would allow any string to be used as a role, losing compile-time safety.

**Built-in roles**: `RASTER`, `VECTOR`, `POINT_CLOUD`, `GEOJSON` — defined as constants in the `LayerRoles` namespace. Modules create custom roles via `LayerRoles.of("my-role")`.

Source: `src/core/framework/types/domain/layer/role.ts`

### LayerConfig as discriminated union

`LayerConfig` is a union of four config types, discriminated by the `role` field. Each variant carries rendering parameters specific to its layer type: raster tile paint properties, vector style paint/layout, point cloud streaming options, GeoJSON feature styling.

The role field acts as a literal discriminator, enabling TypeScript to narrow the config type in switch/case and type guard patterns.

**Alternatives considered**: Single flat config with optional fields for every role — rejected because it loses compile-time guarantees about which fields are valid for which role. Generic config type — rejected because it would require type parameters throughout the codebase.

Source: `src/core/framework/types/domain/layer/config.ts`

### LayerConfigRegistry — open for extension

`LayerConfigRegistry` is a TypeScript interface (not a type alias) mapping role strings to config types. Built-in entries are defined in `config.ts`. Modules add entries via declaration merging: this enables `LayerConfigFor<"custom-role">` to resolve to a custom config type without modifying core.

Source: `src/core/framework/types/domain/layer/config.ts` — `LayerConfigRegistry`

### RenderDescriptor — immutable value object

`RenderDescriptor` bundles role, source URL, and configuration into a single immutable object. It replaces the previous split of `layerConfig` + `sourceUrl` that was stored separately in `DisplayRole` and `SnapshotItem`.

**Why immutable**: Config updates return a new descriptor via object spread. Original descriptors are never mutated. This enables MobX to detect changes through reference equality (`comparer.structural` on `layerSnapshot`).

**Why bundled**: Source URL and config travel together — no risk of one being updated without the other.

**Pure helper functions**: `makeRenderDescriptor` (constructor), `updateDescriptorConfig` (immutable update), `isDescriptorRole` (type narrowing).

Source: `src/core/framework/types/domain/layer/descriptor.ts`

### LayerAdapter — role-scoped rendering contract

Each adapter manages layers of a single role. Four methods define the full rendering lifecycle:

| Method | Purpose | Adapter freedom |
|---|---|---|
| Add-to-map | Create a new map layer | Adapter chooses MapLibre source+layer or deck.gl overlay |
| Remove-from-map | Clean up | Adapter removes its own layers and internal state |
| Update visibility | Toggle on/off | May use MapLibre layout visibility or deck.gl layer visibility |
| Update config | Apply new config | Adapter decides: in-place update (e.g., point cloud color scheme) or recreate (remove + add) |

**Why per-role adapters**: Each data type (raster, vector, point cloud) has fundamentally different rendering backends (MapLibre sources vs deck.gl layers). A single adapter class would need internal branching by type. Per-role adapters keep each implementation self-contained.

**Optional data access**: The point cloud adapter exposes loaded data through an optional method for measurement tools.

Source: `src/core/framework/types/domain/layer/adapter.ts`

### RenderUnit — adapter + descriptor pairing

`RenderUnit` pairs an adapter with a descriptor for one or more tree nodes. The identifier is the map-layer key; node identities track which tree nodes contribute to this unit.

**Single-node case**: Most layers produce one unit with one node identity.

**WMS grouping**: When multiple WMS layers share the same endpoint, they are grouped into one unit with multiple node identities. The WMS grouper logic is in `src/core/shared/protocols/ogc/wms/grouper.ts`.

Source: `src/core/framework/types/domain/layer/renderUnit.ts`

### MapContext — service locator for adapters

`MapContext` provides the map instance and overlay manager to adapter methods. The map field is a MapLibre GL map instance; the overlay manager handles deck.gl rendering.

**Why a context object, not individual parameters**: Adding a new service requires changing only the context, not every adapter method signature. The object is read-only — adapters cannot mutate the context.

Source: `src/core/framework/types/domain/layer/mapContext.ts`

### LayerAdapterFactory — role → adapter registry

The factory holds a mapping from display roles to adapter instances. Registration is async (adapters may need async initialization). The factory validates that the adapter's declared role matches the registration role — mismatch throws.

**Idempotent registration**: Re-registering the same role replaces the previous adapter. No warning, no rejection.

Source: `src/core/domain/adapters/layer/LayerAdapterFactory.ts`

### LayerManager — reactive sync loop

```
TreeStore.layerSnapshot (computed, structural equality)
  │
  ▼
MobX reaction (debounced)
  │
  ▼
buildGroupedRenderUnits(snapshot, adapterFactory)
  │  └─ buildDesiredRenderUnits() → Map<id, RenderUnit>
  │  └─ applyWmsGrouping()
  │
  ▼
syncAllLayers()
  ├─ diff: added / removed / changed (by adapter + descriptor + visibility)
  ├─ remove: adapter.removeFromMap() for removed units
  ├─ add: adapter.addToMap() for new units
  └─ update: adapter.updateConfig() or adapter.updateVisibility() for changed units
```

**Debounce**: The MobX reaction batches rapid changes. Multiple tree mutations within a short window trigger a single reconciliation pass.

**Deferred init**: `LayerManager` waits for the map to load before processing the first snapshot. If the snapshot arrives before the map loads, units are held and processed when the map is ready.

Source: `src/core/domain/managers/LayerManager.ts`, `src/core/domain/managers/layerSync.ts`

### buildDesiredRenderUnits — pure function

Takes a snapshot array and an adapter factory, returns a map of render units. Filters out invisible items, items with null descriptors, and items with no registered adapter for their role.

This is a pure function — no side effects, no MobX, deterministic.

Source: `src/core/domain/managers/layerSync.ts`

## Extension Points

| Extension Point | Mechanism | Used By |
|-----------------|-----------|---------|
| New display role | `LayerRoles.of("name")` | Modules |
| New config type | Declaration merging on `LayerConfigRegistry` | Modules |
| New adapter | Implement `LayerAdapter`, register via `LayerAdapterFactory` | Core, modules |
| New WMS grouping strategy | Add function to `buildGroupedRenderUnits` | Core |

## Trade-offs

- **Data access method returns an untyped value** — consumers must cast to the expected type. Trade-off: the adapter interface stays generic; modules lose type safety on data access. Mitigation: well-known adapters document their data type.
- **Adapters choose update vs recreate** — the update-config method leaves the update strategy to each adapter. Some adapters update in-place (point cloud color scheme), others fall back to remove + add. Trade-off: no standardized behavior; consumers cannot predict whether a config update will flicker or be seamless.
- **Single factory, no lazy loading** — the adapter factory holds all adapters in memory. Trade-off: simple but all adapters are loaded at init even if never used.
- **Debounced reaction may drop intermediate values** — rapid slider movements may skip frames. Trade-off: reduced CPU/GPU load; final value always applied (see layer-tools spec for debounce guarantees).
- **Snapshot items with null descriptors are silently skipped** — nodes loaded without display data produce no render units. Trade-off: the layer tree may show nodes that never appear on the map; addressed by `node-roles` spec placeholder rules.

## Directory

```
src/core/
├── framework/types/domain/layer/
│   ├── role.ts          # LayerRole, LayerRoles, BUILT_IN_ROLES
│   ├── config.ts        # LayerConfig discriminated union, LayerConfigRegistry
│   ├── descriptor.ts    # RenderDescriptor, make/update/isDescriptorRole
│   ├── adapter.ts       # LayerAdapter interface
│   ├── renderUnit.ts    # RenderUnit, SnapshotItem
│   └── mapContext.ts    # MapContext
├── domain/
│   ├── adapters/layer/
│   │   ├── LayerAdapterFactory.ts
│   │   ├── createDefaultLayerConfig.ts  # LayerConfigRegistry, defaults
│   │   └── impl/
│   │       ├── RasterAdapter.ts
│   │       ├── VectorAdapter.ts
│   │       ├── PointCloudAdapter.ts
│   │       └── GeoJsonAdapter.ts
│   └── managers/
│       ├── LayerManager.ts
│       └── layerSync.ts   # buildDesiredRenderUnits, buildGroupedRenderUnits
```

## Overlay System

Deck.gl renders volumetric data (point clouds, 3D vectors) as a WebGL overlay on top of MapLibre via `MapboxOverlay` with `interleaved: true`. Multiple deck.gl layers coexist in a single overlay.

**OverlayManager** (`src/core/domain/overlay/deck/DeckOverlayManager.ts`) manages the overlay lifecycle: `attachToMap(map)`, `detachFromMap()`, `addLayer(layerId, layer)`, `removeLayer(layerId)`, `updateLayer(layerId, props)` via `layer.clone(props)`, `setLayerVisibility(layerId, visible)`, `pickObject(x, y, radius?)` for measurement tools.

**PointCloudLayerFactory** (`src/core/domain/overlay/deck/layers/PointCloudLayerFactory.ts`) creates deck.gl `PointCloudLayer` instances from `PointCloudData` + `PointCloudLayerConfig`. Handles `LNGLAT_OFFSETS` coordinate system, color schemes (RGB, intensity, elevation, ASPRS LAS classification), `pointSize`, and `opacity`.

## Point Cloud Streaming

COPC (Cloud Optimized Point Cloud) files are loaded progressively using viewport-based LOD.

**CopcStreamingLoader** (`src/core/domain/overlay/deck/loaders/CopcStreamingLoader.ts`) streams COPC.LAZ files: initializes by fetching COPC metadata and octree hierarchy, selects nodes for the current viewport via `selectNodesForViewport()`, queues and loads nodes with configurable concurrency (max 4), and emits `PointCloudData` via `onPointsLoaded` callback. Configurable with `pointBudget` (default 10M), `viewportDebounceMs` (150), `minDetailZoom` (10), `maxOctreeDepth` (20).

**ViewportManager** (`src/core/domain/overlay/deck/ViewportManager.ts`) listens to MapLibre events and calculates target octree depth dynamically from COPC spacing and ground resolution, with adjustments for pitch and camera distance. Lifecycle: `start()` / `stop()` / `destroy()`.

**Coordinate transformation**: COPC files may use any projected coordinate system. The loader transforms to WGS84 (EPSG:4326) via proj4, storing positions as offsets from `coordinateOrigin`.

**Memory management**: Pre-allocated `Float32Array` buffers sized to `pointBudget × 3`. Node cache tracks loaded/pending/error state. Budget enforcement stops loading when exceeded. Error nodes can be re-queued on next viewport change.
