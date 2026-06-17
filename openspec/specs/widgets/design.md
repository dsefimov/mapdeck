## Context

Widgets are the primary UI extension mechanism in the portal. Each widget is a reusable panel — attribute table, measurement tools, settings panel, layer tree — rendered as a floating, draggable, resizable overlay on top of the map. Widgets are plain objects (no class, no state — see `extension-system` spec), registered explicitly, and may provide translations, settings, and lifecycle hooks.

## Goals / Non-Goals

**Goals:**
- Document the Widget interface and its optional fields
- Document registration flow: explicit array → catalogStore → auto-registration of translations and settings
- Document open/close lifecycle and state persistence
- Document the 80×45 grid layout system
- Document directory conventions and CSS theming rules
- Reference extension-system, locale, settings, and state-management specs

**Non-Goals:**
- Specifying the internal implementation of individual widgets
- Changing any widget runtime behavior or the grid library
- Documenting `config.json` usage (widget definition is in TypeScript, not JSON)

## Decisions

### Widget as plain object, not class

Widgets are plain objects — no class, no `isActive`, no lifecycle beyond `initialize`/`destroy`. This follows the Objects vs Classes rule from `extension-system`.

**Why**: Widgets have no mutable state of their own. The widget object is a descriptor (id, name, icon, component reference). Any state lives either in a widget-local store (created via `getWidgetStore`) or in global stores (settingsStore, treeStore).

Source: `src/core/framework/types/framework/widget.ts`

### Auto-registration of translations and settings

When `catalogStore.registerWidget(widgetDef)` is called, translations and settings are automatically registered — no separate calls needed.

```
registerWidget(widgetDef)
  ├─ if widgetDef.localeTranslations:
  │    └─ localeStore.registerTranslations(widgetDef.id, widgetDef.localeTranslations)
  ├─ if widgetDef.settings:
  │    └─ for each setting: settingsStore.registerSetting(widgetDef.id, widgetDef.name, setting)
  └─ catalogStore._widgets.set(widgetDef.id, widgetDef)
```

**Why**: Single registration point eliminates synchronization errors (widget registered but translations missed). The widget definition is the single source of truth for what the widget provides.

Source: `src/core/framework/store/widget/WidgetCatalogStore.ts`

### Grid: 80×45 react-grid-layout with edge snapping

Widgets render on an 80-column × 45-row grid using `react-grid-layout`. Dragging to any edge snaps to full width/height.

**Why**: The grid provides a consistent coordinate system for widget positioning. Edge snapping makes it easy to maximize a widget without precise dragging. `react-grid-layout` provides drag, resize, and collision detection out of the box.

**Why 80×45**: This ratio approximates a 16:9 viewport at a comfortable widget density. Each unit is relatively coarse, preventing excessive granularity in drag operations.

Source: `src/core/framework/store/widget/WidgetOverlayStore.ts`, `WidgetLayoutStore.ts`

### State persistence across open/close

Widget-local state survives `closeWidget()` → `openWidget()` cycles via `overlayStore.getWidgetStore(id, factory)`. The store is lazily created on first access and cached until explicitly removed.

**Why**: Users expect their filters, selections, and scroll positions to survive panel close. Recreating state on every open loses context. The factory pattern defers creation cost to first use.

Source: `src/core/framework/store/widget/WidgetOverlayStore.ts` — `getWidgetStore()`

### Rule of three for directory structure

≤3 source files → flat directory. >3 → `components/`, `store/`, `utils/` subdirectories.

**Why**: For small widgets (e.g., a simple settings panel), subdirectories add navigation overhead with no benefit. The threshold of 3 files is a pragmatic guideline, not a strict contract.

### CSS Modules with theme variables

All widget styles use CSS Modules (`.module.css`) co-located with the component. Styles reference theme variables from `theme.css` — no hardcoded values.

**Why**: CSS Modules provide scoped class names, preventing style leakage between widgets. Theme variables ensure visual consistency and enable future theming (dark mode, etc.).

**Constraint**: Widgets must not import styles from other widgets — each widget's styles are self-contained.

Source: `src/core/ui/styles/theme.css`

### Sidebar visibility flag

`showInSidebar: true` (default) renders the widget as a sidebar icon button. `showInSidebar: false` hides it — the widget is openable only programmatically.

**Why**: Not all widgets need sidebar presence. The `MapViewer` widget (the map itself) is always visible and goes through a different rendering path. Other widgets may be context-dependent and opened by tools or modules.

## Directory Layout

```
src/widgets/<widget-name>/
├── index.ts               # Public API barrel
├── locale.ts              # Translations (optional)
├── types.ts               # Props and local types
├── components/            # (if >3 files total)
│   ├── Widget.tsx
│   ├── Widget.module.css
│   └── ...
├── store/                 # (if >3 files total)
│   └── WidgetStore.ts
└── utils/                 # (if >3 files total)
    └── ...
```

## Risks / Trade-offs

- **Single catalog for all widgets**: All widgets registered in one store. Trade-off: no lazy loading; all widget metadata is loaded at init. Mitigation: widget count is small; component code is tree-shaken by the bundler.
- **No widget dependency management**: Widgets can't declare dependencies on other widgets or on specific stores being ready. Trade-off: simpler model; a widget accessing an uninitialized store gets a runtime error. Mitigation: init order guarantees that all stores are ready before widgets are opened.
- **Grid layout is client-side only**: Widget positions don't persist across page refreshes. Trade-off: simpler than a server-synced layout; snap-to-default behavior on reload is acceptable.
