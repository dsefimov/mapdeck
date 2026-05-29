# Overlay System

## Architecture

Deck.gl renders volumetric data (point clouds, 3D vectors) as a WebGL overlay on top of MapLibre. The overlay uses `MapboxOverlay` with `interleaved: true` for seamless integration.

```
MapLibre Map
  └─ MapboxOverlay (interleaved: true)
       ├─ PointCloudLayer (layer 1)
       ├─ PointCloudLayer (layer 2)
       └─ ... (any number of deck.gl layers)
```

Multiple layers coexist in a single overlay — no need for multiple overlay instances.

---

## OverlayManager

Singleton managing the Deck.gl overlay lifecycle. Attached/detached by `MapStore.setMap()` / `MapStore.dispose()`.

| Method | Purpose |
|--------|---------|
| `attachToMap(map)` | Create `MapboxOverlay` and add as MapLibre control |
| `detachFromMap()` | Remove overlay from map |
| `addLayer(layerId, layer)` | Add a deck.gl `Layer` to the overlay |
| `removeLayer(layerId)` | Remove layer by ID |
| `updateLayer(layerId, props)` | Update layer via `layer.clone(props)` |
| `setLayerVisibility(layerId, visible)` | Toggle visibility without recreation |
| `pickObject(x, y, radius?)` | Pick objects at screen coordinates (used by measure tools) |
| `dispose()` | Clean up all resources |

See: [`src/core/domain/overlay/deck/DeckOverlayManager.ts`](../../../src/core/domain/overlay/deck/DeckOverlayManager.ts)

---

## IOverlayManager

Generic interface for overlay manager implementations. Enables abstraction if a different rendering backend is needed.

See: [`src/core/domain/overlay/types.ts`](../../../src/core/domain/overlay/types.ts)

---

## PointCloudLayerFactory

Creates deck.gl `PointCloudLayer` instances from `PointCloudData` + `PointCloudLayerConfig`. Handles:

- **Coordinate system**: `LNGLAT_OFFSETS` — positions are offsets from `coordinateOrigin` (WGS84 degrees)
- **Color schemes**: RGB, intensity, elevation, classification (ASPRS LAS standard colors)
- **Styling**: `pointSize`, `opacity`

Used by `PointCloudAdapter` to create/recreate layers when data loads or config changes.

See: [`src/core/domain/overlay/deck/layers/PointCloudLayerFactory.ts`](../../../src/core/domain/overlay/deck/layers/PointCloudLayerFactory.ts)

---

## Picking

`pickObject(x, y, radius?)` is used by measurement and feature-info tools to query rendered objects:

| Tool | Usage |
|------|-------|
| Ruler3D | Pick 3D points for distance measurement |
| AreaMeasure | Pick points for area calculation |
| VolumeMeasure | Pick points for TIN surface |
| FeatureInfo | Pick overlay objects (point clouds) |

---

## Layer Update

Config changes trigger `adapter.updateConfig()` on the corresponding render unit. The current behaviour depends on the adapter:

- **RasterAdapter / VectorAdapter**: full recreate — `map.removeLayer` + `map.removeSource` + re-add.
- **PointCloudAdapter**: calls `overlayManager.addLayer()` which detects an existing layer and replaces it with a new `deck.gl` instance.

The `DeckOverlayManager.updateLayer(layerId, props)` method exists for clone-based updates (`layer.clone(props)`) but is not yet used by adapters — full recreation is still the default. Incremental `updateConfig` is tracked in [PLAN.md](../../PLAN.md).

---

## Related

- [layer-adapters.md](./layer-adapters.md) — How adapters use the overlay
- [point-cloud-streaming.md](./point-cloud-streaming.md) — COPC streaming + overlay integration
