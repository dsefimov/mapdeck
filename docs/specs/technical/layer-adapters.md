# Layer Adapters

## Architecture

Layer adapters bridge the gap between abstract layer roles and concrete rendering engines. Two rendering backends:

| Backend | Roles | How it renders |
|---------|-------|---------------|
| **MapLibre GL** | `raster`, `vector` | Native map layers — sources + layers |
| **Deck.gl** | `point-cloud`, `vector3d` | WebGL overlay — GPU-accelerated point clouds and 3D vectors |

The split is architectural: simple 2D layers use MapLibre, volumetric/complex data uses Deck.gl.

---

## LayerAdapterFactory

Singleton registry mapping `LayerRole` → `LayerAdapter`.

| Method | Purpose |
|--------|---------|
| `register(role, adapter)` | Register adapter for a role (idempotent) |
| `get(role)` | Get adapter by role (throws if not found) |
| `has(role)` | Check if adapter is registered |

See: [`src/core/domain/adapters/layer/LayerAdapterFactory.ts`](../../../src/core/domain/adapters/layer/LayerAdapterFactory.ts)
---

## Adapters

### RasterAdapter

Adds raster tile source (XYZ, WMS, COG) and layer to MapLibre.

| Method | Implementation |
|--------|---------------|
| `addToMap` | `map.addSource(id, { type: "raster", tiles: [url] })` + `map.addLayer({ type: "raster" })` |
| `removeFromMap` | `map.removeLayer` + `map.removeSource` |
| `updateVisibility` | `map.setLayoutProperty(id, "visibility", ...)` |

> **TODO**: Implement incremental `updateConfig` — currently falls back to full remove+add. Tracked in [PLAN.md](../../PLAN.md).

See: [`src/core/domain/adapters/layer/impl/RasterAdapter.ts`](../../../src/core/domain/adapters/layer/impl/RasterAdapter.ts)

### VectorAdapter

Adds vector tile source and layer (fill/line/circle/symbol) to MapLibre.

| Method | Implementation |
|--------|---------------|
| `addToMap` | `map.addSource(id, { type: "vector", tiles: [url] })` + `map.addLayer({ type: layerType })` |
| `removeFromMap` | `map.removeLayer` + `map.removeSource` |
| `updateVisibility` | `map.setLayoutProperty(id, "visibility", ...)` |

> **TODO**: Fix `_createLayerSpec` — currently uses hardcoded colors/sizes. Must use `config.paint` and `config.layout`. See [PLAN.md](../../PLAN.md).

See: [`src/core/domain/adapters/layer/impl/VectorAdapter.ts`](../../../src/core/domain/adapters/layer/impl/VectorAdapter.ts)

### PointCloudAdapter

Streams COPC/LAZ point cloud data with viewport-based LOD. Uses Deck.gl via `overlayManager`.

| Method | Implementation |
|--------|---------------|
| `addToMap` | Creates `CopcStreamingLoader` + `ViewportManager`, initializes async, calls `updateDeckLayer` on data load |
| `removeFromMap` | Cancels init task, stops viewport manager, destroys loader, removes overlay |
| `updateVisibility` | `overlayManager.setLayerVisibility` |

State: per-layer state stored in a single `_layers: Map<string, PointCloudLayerState>`. Each entry bundles loader, viewportManager, config, data, and lifecycle state.

> **TODO**: Implement incremental `updateConfig` — currently falls back to full recreate. Tracked in [PLAN.md](../../PLAN.md).

See: [`src/core/domain/adapters/layer/impl/PointCloudAdapter.ts`](../../../src/core/domain/adapters/layer/impl/PointCloudAdapter.ts)

### Vector3DAdapter

Adds 3D vector lines (GeoJSON) to MapLibre.

| Method | Implementation |
|--------|---------------|
| `addToMap` | `map.addSource(id, { type: "geojson", data: url })` + `map.addLayer({ type: "line" })` |
| `removeFromMap` | `map.removeLayer` + `map.removeSource` |
| `updateVisibility` | `map.setLayoutProperty(id, "visibility", ...)` |

> **TODO**: Migrate to Deck.gl for 3D rendering (consistent with point-cloud). See [PLAN.md](../../PLAN.md).

See: [`src/core/domain/adapters/layer/impl/Vector3DAdapter.ts`](../../../src/core/domain/adapters/layer/impl/Vector3DAdapter.ts)

---

## Registration

All adapters registered once at app startup:

See: [`src/core/domain/adapters/layer/registerLayerAdapters.ts`](../../../src/core/domain/adapters/layer/registerLayerAdapters.ts)

---

## Adding a New Adapter

1. Create class implementing `LayerAdapter` in [`src/core/domain/adapters/layer/impl/`](../../../src/core/domain/adapters/layer/impl/)
2. Add to `ADAPTERS` array in `registerLayerAdapters.ts`
3. Implement `updateConfig` for incremental style updates (optional — falls back to full recreate by default)

---

## Related

- [layer-system.md](../domain/layer-system.md) — LayerRole, LayerConfig, data flow
- [overlay-system.md](./overlay-system.md) — Deck.gl overlay management
