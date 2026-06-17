## Context

Map tools are the map-level interaction extension point. Unlike layer tools (context menu actions scoped by layer role), map tools provide map-wide interactions — measurement, basemap switching, feature inspection. Map tools are classes with observable state and an activate/deactivate lifecycle. The tool instance itself serves as its own MobX store.

## Goals / Non-Goals

**Goals:**
- Document the MapTool and MapActionTool interfaces and their differences
- Document the activate/deactivate lifecycle and tool instance persistence
- Document state rules: MobX on the instance, not React useState
- Document registration via MapToolStore with settings auto-registration
- Document placement and ordering
- Explicitly state the architectural debt in existing tools
- Reference extension-system, settings, locale, and widgets specs

**Non-Goals:**
- Specifying individual tool implementations (ruler, basemap, etc.)
- Changing any runtime tool behavior
- Migrating existing tools from useState to MobX (tracked in PLAN.md)

## Decisions

### Two distinct subtypes: MapTool vs MapActionTool

The map tool system has two interfaces rather than a single one with optional fields.

| Trait | MapTool | MapActionTool |
|-------|---------|---------------|
| Has `isActive` | Yes (observable) | No |
| Has `activate/deactivate` | Yes | No |
| Renders component | Yes (when active) | No |
| Has `execute(rootStore)` | No | Yes |
| Example | Ruler3D | Reset Orientation |

**Why**: A one-click action (reset orientation) has fundamentally different needs from an interactive tool (3D measurement). Forcing `isActive` and a component on a one-click tool adds dead fields. A single interface with optional everything would lose compile-time clarity.

**Alternatives considered**: Single `MapTool` interface with optional `execute` and optional `activate` — rejected because TypeScript can't guarantee which methods are available without runtime checks.

Source: `src/core/framework/types/framework/tools.ts`

### Tool instance as its own store

MapTool instances are MobX-observable classes. No separate tool-local store registry exists (unlike widgets, which use `getWidgetStore`). The tool instance is created once at registration and persists for the app lifetime.

**Why**: Map tools have a simple lifecycle — they're always present, just active or inactive. A separate store registry adds indirection with no benefit. The `isActive` flag and any measurement data live directly on the instance. `makeObservable` in the constructor sets up MobX for the instance.

**Architectural debt**: Existing tools (Ruler3D, AreaMeasure, VolumeMeasure, FeatureInfo) store business state in component `useState` instead of on the tool instance. This is a known deviation from the contract, tracked in PLAN.md (Module 1). New tools must not follow the existing pattern.

Source: `src/map-tools/basemap/components/Tool.ts` (correct pattern), `src/map-tools/ruler-3d/components/Panel.tsx` (debt pattern)

### Single active tool

`MapToolStore` enforces that at most one interactive tool is active at a time. Activating a new tool deactivates the currently active one.

**Why**: Multiple simultaneous interactive tools would create conflicting map interactions (two tools both listening to click events, both drawing on the map). Single-activation prevents this. Action tools (`MapActionTool`) are exempt — they execute and return immediately, so they don't conflict.

Source: `src/core/framework/store/map/MapToolStore.ts` — `activateTool()`

### Placement-based UI grouping

Tools declare a `placement` (top-left, top-right, bottom-left, bottom-right) and an `order` number. The UI renders them as grouped icon buttons.

**Why**: Map interaction buttons are typically positioned at map corners (like MapLibre's native controls). Grouping by placement and sorting by order gives predictable layout without requiring pixel coordinates.

Source: `src/core/framework/store/map/MapToolStore.ts` — `toolsList` computed

### Settings auto-registration

Map tools declare settings directly on the class as a `settings` array. `MapToolStore.registerTool()` auto-registers them with `SettingsStore`.

```
mapToolStore.registerTool(tool)
  └─ if tool.settings:
       └─ for each setting: settingsStore.registerSetting(tool.id, tool.name, setting)
  └─ tools.set(tool.id, tool)
```

This is identical to the widget settings auto-registration pattern. See `openspec/specs/settings/`.

Source: `src/core/framework/store/map/MapToolStore.ts`

### Component receives deactivate callback

The tool's React component receives `deactivate` as a prop — a function that calls `mapToolStore.deactivateTool()`. The component can deactivate itself (e.g., a "Done" button, or pressing Escape).

**Why**: The component controls its own dismissal without needing to know about `mapToolStore`. The callback is passed as a prop, keeping the component decoupled from the store layer.

Source: `src/core/framework/types/framework/tools.ts` — `MapToolComponentProps`

## Directory Layout

```
src/map-tools/<tool-name>/
├── index.ts                  # Barrel export
├── locale.ts                 # Translations (optional)
├── types.ts                  # Types (optional)
├── components/
│   ├── Tool.ts               # Class implementing MapTool
│   ├── Panel.tsx             # React component
│   └── Panel.module.css
└── utils/                    # Pure functions (optional)
```

## Risks / Trade-offs

- **Architectural debt in existing tools**: Ruler3D, AreaMeasure, VolumeMeasure, and FeatureInfo violate the contract (state in React useState). Risk: new developers copy the wrong pattern. Mitigation: this spec explicitly documents the debt; PLAN.md tracks migration.
- **Single active tool limitation**: Only one interactive tool at a time. Trade-off: simpler conflict resolution; a future use case requiring simultaneous tools (e.g., measure + feature info) would need architectural change.
- **Tool instance never garbage-collected**: Tool instances live for the app lifetime. Trade-off: acceptable because tool count is small (<10); no cleanup complexity.
