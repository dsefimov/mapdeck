# Point Color Scheme Selector — Design

## Context

Controls the color scheme of point cloud layers. Developers can choose between natural colors (RGB), classification, elevation, or intensity-based coloring. Available only for point cloud layers.

## Patterns

### Config Write Pattern

The tool writes a scheme value to the color scheme setting. The rendering adapter reads the scheme and applies the appropriate color mapping in the GPU shader. Invalid values fall back to `RGB`.

Source: `src/layer-tools/point-color-scheme/components/Tool.tsx`

### Supported Schemes

| Scheme | Description |
|--------|-------------|
| RGB / natural colors | Original point colors |
| By classification | Color by classification code |
| By elevation | Color by Z value |
| By intensity | Color by intensity value |

### Validation Guard

Component checks: node exists in `TreeStore`, node is a `LayerNode`, config matches `PointCloudLayerConfig`. On any failure, component returns `null`.

### UI

Dropdown selector with four options. Calls `treeStore.updateLayerConfig()` with the selected scheme.

Source: `src/layer-tools/point-color-scheme/components/Panel.tsx`

### Locale

Namespace: `"point-color-scheme-selector"`. Keys: `tool.name`, `label.colorBy`, `scheme.rgb`, `scheme.classification`, `scheme.elevation`, `scheme.intensity`, `aria.colorScheme`.

Source: `src/layer-tools/point-color-scheme/locale.ts`

## Extension Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New color schemes | Add entries to `ColorScheme` enum and implement mapping in `PointCloudLayerFactory` |
| Custom scheme UI | Replace the dropdown with a custom selector component |

## Trade-offs

- **Fixed scheme set** — the four schemes are built into the `ColorScheme` enum. Adding a new scheme requires a code change in core types. Trade-off: simplicity over dynamic extensibility; modules cannot register custom schemes without core changes.
- **Scheme switch is immediate** — no transition animation between schemes. Trade-off: fast response over visual polish; point cloud recoloring is GPU-bound and transitions would add frame latency.

## Directory

```
src/layer-tools/point-color-scheme/
├── index.ts
├── locale.ts
└── components/
    ├── Tool.tsx
    ├── Panel.tsx
    └── Panel.module.css
```
