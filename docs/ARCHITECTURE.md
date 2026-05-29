# Mapdeck Architecture

High-level blueprint for a modular geospatial visualization platform.

## Dependency Graph
Strict unidirectional flow. **Cross-sibling & reverse imports are forbidden.**

```
App                → depends on all layers
Widgets | LayerTools → depends on Core only
MapTools | Modules → depends on Core only
Core               → depends on external libraries only
```

## End-to-End Rendering Flow

How a layer node becomes pixels on the map:

```
Module / built-in data source
  └─ creates TreeNode with roles.display = { render: RenderDescriptor { role, sourceUrl, config } }
       └─ stored in LayerTreeStore (MobX observable tree)
            └─ layerSnapshot — frozen snapshot of the tree built by LayerTreeStore
                 └─ LayerManager.syncAllLayers() reaction fires on snapshot change
                      └─ buildGroupedRenderUnits(snapshot, adapterFactory) → Map<unitId, RenderUnit>
                           └─ RenderUnit = { id, nodeIds, descriptor: RenderDescriptor, adapter: LayerAdapter }
                                └─ adapter.addToMap(unitId, descriptor, mapContext)
                                     ├─ Raster/VectorAdapter → MapLibre GL source + layer
                                     └─ PointCloudAdapter → Deck.gl overlay layer
```

Key: `LayerManager` never reads the tree directly — it receives diffs via `layerSnapshot`, builds `RenderUnit` objects through `buildGroupedRenderUnits()`, and delegates all map mutations to `LayerAdapter` instances.

## Layer Map & Extension Points
| Layer | Responsibility | How to extend | Spec |
|-------|----------------|---------------|------|
| **App** | Application shell, single-workspace layout | Edit `src/app/App.tsx` and `src/app/workspace/` | `docs/specs/dev/routing.md` |
| **Widgets** | Reusable UI blocks | Implement `Widget<TProps>`, register in catalog | `docs/specs/dev/widgets.md` |
| **LayerTools** | Layer-specific actions | Implement `LayerTool`, attach to layer menu | `docs/specs/dev/tools.md` |
| **MapTools** | Map interaction (measure, basemap, etc.) | Implement `MapTool`/`MapActionTool`, register in `MapToolStore` | `docs/specs/dev/map-tools.md` |
| **Modules** | External data adapters (STAC, etc.) | Implement `Module` + `SourceAdapter`, return `NodeRoles` | `docs/specs/dev/modules.md` |
| **Core** | Shared infrastructure | Add to the appropriate `core/` subdirectory. | `docs/specs/domain/` |

## State & Cross-Cutting Rules
- **State**: React `useState` → UI. MobX → domain. See [`state-management.md`](./specs/domain/state-management.md) for the decision guide.
- **Types**: Tiered (`framework/`, `domain/`, `data/`, `config/`). Import via `@core/types`.
- **Settings**: Centralized via `SettingsStore`. See domain specs.

## Documentation Index

| If you want to… | Read first |
|-----------------|------------|
| See priorities & backlog | [`docs/PLAN.md`](./PLAN.md) |
| Understand architecture & boundaries | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) (this file) |
| Understand UI component structure | [`docs/specs/dev/components.md`](./specs/dev/components.md) |
| **Add a widget** | [`specs/dev/widgets.md`](./specs/dev/widgets.md) |
| **Add a layer tool** | [`specs/dev/tools.md`](./specs/dev/tools.md) |
| **Add a map tool** | [`specs/dev/map-tools.md`](./specs/dev/map-tools.md) |
| **Add a data module** | [`specs/dev/modules.md`](./specs/dev/modules.md) |
| **Understand app layout** | [`specs/dev/routing.md`](./specs/dev/routing.md) |
| **Add localization** | [`specs/dev/localization.md`](./specs/dev/localization.md) |
| Understand state management | [`specs/domain/state-management.md`](./specs/domain/state-management.md) |
| Understand the NodeRole system | [`specs/domain/node-role.md`](./specs/domain/node-role.md) |
| Understand layer config & roles | [`specs/domain/layer-system.md`](./specs/domain/layer-system.md) |
| Understand layer adapters | [`specs/technical/layer-adapters.md`](./specs/technical/layer-adapters.md) |
| Understand overlay rendering | [`specs/technical/overlay-system.md`](./specs/technical/overlay-system.md) |
| Understand type organization | [`specs/technical/type-organization.md`](./specs/technical/type-organization.md) |

## Navigation Rules
1. Check `PLAN.md` → search codebase → pick target layer from table above.
2. Follow `How to extend` link for interfaces & registration steps.
3. **Stop** if dependency graph is violated or required spec is missing → request clarification.
