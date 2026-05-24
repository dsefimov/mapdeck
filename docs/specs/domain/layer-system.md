# Layer System

## LayerRole

`LayerRole` defines the rendering behavior of a layer. Each role maps to a dedicated `LayerAdapter`.

| Role | Renders | Adapter |
|------|---------|---------|
| `raster` | Tile layers (XYZ, WMS, COG) | `RasterAdapter` |
| `vector` | Vector tiles (fill, line, circle, symbol) | `VectorAdapter` |
| `point-cloud` | COPC/LAZ point clouds with streaming | `PointCloudAdapter` |
| `vector3d` | 3D lines, paths | `Vector3DAdapter` |

See: [`src/core/framework/types/domain/layer/role.ts`](../../../src/core/framework/types/domain/layer/role.ts)

---

## LayerConfig

`LayerConfig` is a **discriminated union** by `role`. Each variant carries rendering parameters specific to its type.

| Config Type | Key Fields |
|-------------|-----------|
| `RasterLayerConfig` | `type: "xyz" | "wms" | "cog"`, `url`, `paint` (MapLibre raster props) |
| `VectorLayerConfig` | `layerType: "fill" | "line" | "circle" | "symbol"`, `paint`, `layout` |
| `PointCloudLayerConfig` | `pointSize`, `colorScheme`, `bounds`, `coordinateOrigin`, `intensityMin/Max`, `classificationFilter` |
| `Vector3DLayerConfig` | `url`, `lineWidth`, `lineColor` |

Type guards (`isRasterConfig`, `isVectorConfig`, etc.) enable narrowing.

See: [`src/core/framework/types/domain/layer/config.ts`](../../../src/core/framework/types/domain/layer/config.ts)

---

## LayerAdapter

Each adapter implements `addToMap`, `removeFromMap`, `updateVisibility`, `updateConfig`. The factory routes operations by role.

```ts
interface LayerAdapter<TRole extends LayerRole = LayerRole> {
    readonly role: TRole;
    addToMap(layerId: string, descriptor: RenderDescriptor<TRole>, map: Map): void;
    removeFromMap(layerId: string, map: Map): void;
    updateVisibility(layerId: string, visible: boolean, map: Map): void;
    updateConfig(renderUnit: RenderUnit<TRole>, map: Map): void;
}
```

Adapters receive a `RenderDescriptor` (role + sourceUrl + config) instead of separate arguments.

See: [`src/core/framework/types/domain/layer/adapter.ts`](../../../src/core/framework/types/domain/layer/adapter.ts)

---

## Adding a Custom Layer Role

Modules can extend the layer system with new roles. The steps:

1. **Define config type** + extend `LayerConfigRegistry` via declaration merging
2. **Implement `LayerAdapter<"your-role">`** 
3. **Register** via `rootStore.layerToolStore.registerRole()` in the module's `register()`

Example: see [`docs/specs/dev/modules.md`](../dev/modules.md).

---

## Style Update Flow

### Current: Full Recreation

Any config change triggers complete layer removal and re-creation:

```
LayerTool → treeStore.updateLayerConfig(nodeId, { opacity: 0.5 })
  └─ merges into displayRole.layerConfig (runInAction)
       └─ LayerManager reaction detects config change
            └─ _updateExistingLayer() → configsDiffer() = true
                 └─ removeLayerFromMap() → addLayerToMap()
                      ├─ RasterAdapter: map.removeLayer + map.removeSource + map.addSource + map.addLayer
                      └─ PointCloudAdapter: destroy loader + viewport + overlay → create all new
```

This causes visible flicker and is expensive for point clouds (destroys streaming state).

### Target: Incremental via `tryUpdateStyle`

```
LayerManager._updateExistingLayer()
  └─ if config changed:
       └─ adapter.tryUpdateStyle?(layerId, updates, map)
            ├─ true  → style applied incrementally, no recreation
            │    ├─ RasterAdapter: map.setPaintProperty(layerId, 'raster-opacity', value)
            │    └─ PointCloudAdapter: update deck.gl layer props (pointSize, colorScheme)
            └─ false → fallback: removeLayerFromMap + addLayerToMap
```

> **TODO**: Implement `tryUpdateStyle` in RasterAdapter and PointCloudAdapter. See [PLAN.md](../../PLAN.md).

---

## Data Flow

```
Module (STAC, etc.)
  └─ creates DisplayRole with layerConfig
       └─ LayerNode.roles = [displayRole]
            └─ LayerManager reads displayRole.layerConfig
                 └─ LayerAdapterFactory.get(config.role)
                      └─ adapter.addToMap(layerId, config, sourceUrl, map)

Style update (incremental):
  LayerTool → treeStore.updateLayerConfig(nodeId, { opacity: 0.5 })
    └─ LayerManager reaction detects config change
         └─ adapter.tryUpdateStyle?(layerId, updates, map)
              ├─ true  → style applied, no recreation
              └─ false → fallback: removeLayer + addLayer
```

The role and config travel together in `DisplayRole.layerConfig`. No duplication, no sync risk.

---

## Adding a New Layer Role

1. Add enum value to `LayerRole` in [`role.ts`](../../../src/core/framework/types/domain/layer/role.ts)
2. Add config interface to `LayerConfig` union in [`config.ts`](../../../src/core/framework/types/domain/layer/config.ts)
3. Add type guard function
4. Add case to `createDefaultConfig`
5. Implement `LayerAdapter` in [`src/core/domain/adapters/layer/impl/`](../../../src/core/domain/adapters/layer/impl/)
6. Register adapter via `LayerAdapterFactory.register(role, adapter)`
7. Optionally implement `tryUpdateStyle` for incremental updates

---

## Related

- [node-role.md](./node-role.md) — How display roles connect to tree nodes
- [layer-adapters.md](../technical/layer-adapters.md) — Adapter implementations
