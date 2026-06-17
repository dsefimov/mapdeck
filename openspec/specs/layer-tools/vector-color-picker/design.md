# Vector Color Picker — Design

## Context

Controls the visual appearance of vector and geojson layers: fill color, border color, and opacity. Available for both vector and geojson layers.

## Patterns

### Multi-Field Config Write

The tool writes to multiple appearance settings (fill color, border color, opacity) in a single `updateLayerConfig()` call. All changes are applied atomically through the descriptor update path — the layer is not recreated between individual field changes.

Source: `src/layer-tools/vector-color-picker/components/Tool.tsx`

### Role Array Binding

Bound to roles `"vector"` and `"geojson"`. At registration time, the tool system resolves the array and registers the tool once per role.

### Validation Guard

Component checks: node exists in `TreeStore`, node is a `LayerNode`, config matches `VectorLayerConfig` or `GeoJsonLayerConfig`. On any failure, component returns `null`.

### UI

Color picker for fill color, color picker for border color, opacity slider. All values call `treeStore.updateLayerConfig()` on change.

Source: `src/layer-tools/vector-color-picker/components/Panel.tsx`

### Locale

Namespace: `"vector-color-picker"`. Keys: `tool.name`, `label.color`, `label.border-color`, `label.opacity`.

Source: `src/layer-tools/vector-color-picker/locale.ts`

## Extension Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New paint properties | Extend `VectorLayerConfig.paint` or `GeoJsonLayerConfig.paint` and add controls |
| Custom color inputs | Replace native color picker with a custom component |

## Trade-offs

- **Shared component for two roles** — one tool object handles both vector and geojson. Trade-off: simpler code but config fields differ slightly between config types; the component must handle both shapes.
- **No color presets** — users pick raw hex values. Trade-off: no theming or palette integration; accepted for MVP.

## Directory

```
src/layer-tools/vector-color-picker/
├── index.ts
├── locale.ts
└── components/
    ├── Tool.tsx
    ├── Panel.tsx
    └── Panel.module.css
```
