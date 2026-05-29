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
    addToMap(layerId: string, descriptor: RenderDescriptor<TRole>, ctx: MapContext): void;
    removeFromMap(layerId: string, ctx: MapContext): void;
    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void;
    updateConfig(renderUnit: RenderUnit<TRole>, ctx: MapContext): void;
    getLoadedData?(layerId: string): unknown;
}
```

All methods receive `ctx: MapContext` (a MapLibre wrapper) instead of a raw `map` object — this keeps adapters decoupled from the MapLibre instance. Data-providing adapters (e.g. `PointCloudAdapter`) may additionally implement `getLoadedData`.

Adapters receive a `RenderDescriptor` (role + sourceUrl + config) on `addToMap`.

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
  └─ updateDescriptorConfig(display.render, updates) → new RenderDescriptor
       └─ display.render = newDescriptor (MobX action)
            └─ LayerManager.syncAllLayers() reaction fires
                 └─ _updateChangedUnits() → _configsDiffer(current.descriptor.config, desired.descriptor.config) = true
                      └─ _removeRenderUnit() + _addRenderUnit()
                           ├─ RasterAdapter: map.removeLayer + map.removeSource + map.addSource + map.addLayer
                           └─ PointCloudAdapter: destroy loader + viewport + overlay → create all new
```

This causes visible flicker and is expensive for point clouds (destroys streaming state).

### Target: Incremental via `updateConfig`

```
LayerManager._updateExistingUnit(current, desired)
  └─ if config or sourceUrl changed:
       └─ adapter.updateConfig(desired, ctx)
            ├─ RasterAdapter: map.setPaintProperty(layerId, 'raster-opacity', value)  ← TODO
            └─ PointCloudAdapter: update deck.gl layer props (pointSize, colorScheme)  ← TODO
            (currently: full removeFromMap + addToMap for both)
```

> **TODO**: Implement incremental updates in `RasterAdapter.updateConfig` and `PointCloudAdapter.updateConfig` — currently both fall back to full recreate. Tracked in [PLAN.md](../../PLAN.md).

---

## Data Flow

```
Module (STAC, etc.)
  └─ creates DisplayRole with display.render = RenderDescriptor { role, sourceUrl, config }
       └─ LayerNode.roles.display = displayRole
            └─ LayerManager reads display.render via layerSnapshot
                 └─ buildGroupedRenderUnits() → RenderUnit { descriptor, adapter }
                      └─ adapter.addToMap(unitId, descriptor, ctx)

Style update:
  LayerTool → treeStore.updateLayerConfig(nodeId, { opacity: 0.5 })
    └─ updateDescriptorConfig(display.render, updates) → new RenderDescriptor
         └─ display.render = newDescriptor
              └─ LayerManager.syncAllLayers() reaction fires
                   └─ _updateChangedUnits() → _configsDiffer() = true
                        └─ _updateExistingUnit() → adapter.updateConfig(desired, ctx)
```

The role, sourceUrl, and config travel together in `DisplayRole.render: RenderDescriptor`. No duplication, no sync risk.

---

## Adding a New Layer Role

1. Add enum value to `LayerRole` in [`role.ts`](../../../src/core/framework/types/domain/layer/role.ts)
2. Add config interface to `LayerConfig` union in [`config.ts`](../../../src/core/framework/types/domain/layer/config.ts)
3. Add type guard function
4. Add case to `createDefaultConfig`
5. Implement `LayerAdapter` in [`src/core/domain/adapters/layer/impl/`](../../../src/core/domain/adapters/layer/impl/)
6. Register role via `rootStore.layerToolStore.registerRole(role, adapter, defaultConfigFactory)` — this wraps adapter registration, config registration, and role discovery. See [modules.md](../dev/modules.md) for a full example.
7. Done — the role is now discoverable and renderable by the system.

---

## Related

- [node-role.md](./node-role.md) — How display roles connect to tree nodes
- [layer-adapters.md](../technical/layer-adapters.md) — Adapter implementations
