# Raster Opacity Slider — Design

## Context

Controls the opacity of raster tile layers (XYZ, WMS, COG). Available only for raster layers.

## Patterns

### Config Write Pattern

The tool writes to the opacity setting via `treeStore.updateLayerConfig()`. The `LayerManager` detects the config change through a MobX reaction and triggers the adapter's update path. The reaction is debounced, so intermediate slider values may not trigger full layer recreations.

Source: `src/layer-tools/raster-opacity/components/Tool.tsx`

### Validation Guard

Component checks three preconditions before rendering: node exists in `TreeStore`, node is a `LayerNode`, config matches `RasterLayerConfig`. On any failure, component returns `null`.

### Locale Integration

Translations registered under namespace `"raster-opacity-slider"` via `localeStore.registerTranslations()`. The UI component reads labels through `localeStore.t(toolId)`. Keys: `tool.name`, `label.opacity`, `aria.opacity`.

Source: `src/layer-tools/raster-opacity/locale.ts`

### UI

Slider input with range 0.0–1.0, step 0.01. Current opacity is displayed as a percentage label.

Source: `src/layer-tools/raster-opacity/components/Panel.tsx`

## Extension Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New paint properties | Extend `RasterLayerConfig.paint` and update the panel UI |
| Custom slider range | Override min/max/step in the tool definition |

## Trade-offs

- **Slider fires on every input event** — responsive UX but generates many `updateLayerConfig()` calls. Mitigation: debounced MobX reaction in `LayerManager` absorbs intermediate values.
- **No config migration** — the tool assumes opacity setting exists in the config. If a module creates a raster layer without initializing paint, the tool will return `null`. Mitigation: default config factories always initialize paint with defaults.

## Directory

```
src/layer-tools/raster-opacity/
├── index.ts
├── locale.ts
└── components/
    ├── Tool.tsx
    ├── Panel.tsx
    └── Panel.module.css
```
