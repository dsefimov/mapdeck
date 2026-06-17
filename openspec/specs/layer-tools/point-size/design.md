# Point Size Slider — Design

## Context

Controls the point size of point cloud layers. Available only for point cloud layers.

## Patterns

### Config Write Pattern

The tool writes to the point size setting via `treeStore.updateLayerConfig()`. The debounced MobX reaction in `LayerManager` absorbs rapid slider movements and triggers the adapter's update path on the settled value.

Source: `src/layer-tools/point-size-slider/components/Tool.tsx`

### Validation Guard

Component checks: node exists in `TreeStore`, node is a `LayerNode`, config matches `PointCloudLayerConfig` and has a point size field. On any failure, component returns `null`.

### Clamping

The tool enforces a minimum point size of 1. Values below the minimum are clamped before writing to config — the config is never set to an out-of-range value.

### UI

Slider that adjusts point size in pixels. Calls `treeStore.updateLayerConfig()` with the new point size value.

Source: `src/layer-tools/point-size-slider/components/Panel.tsx`

### Locale

Namespace: `"point-size-slider"`. Keys: `tool.name`, `label.pointSize`, `aria.pointSize`.

Source: `src/layer-tools/point-size-slider/locale.ts`

## Extension Points

| Extension Point | Mechanism |
|-----------------|-----------|
| Custom min/max range | Configure in tool definition constants |
| Additional point visualizations | Extend `PointCloudLayerConfig` and add new panel controls |

## Trade-offs

- **Single size for all points** — the tool sets one point size for the entire layer. No per-point or per-classification size variation. Trade-off: simplicity over fidelity; accepted for MVP.
- **No undo stack** — the tool writes directly to config with no history. Trade-off: UI simplicity; users can manually return to default values.

## Directory

```
src/layer-tools/point-size-slider/
├── index.ts
├── locale.ts
└── components/
    ├── Tool.tsx
    ├── Panel.tsx
    └── Panel.module.css
```
