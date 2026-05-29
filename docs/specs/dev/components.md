# UI Component Structure

Mapdeck organises UI components into three tiers within `src/core/`, determined by their coupling to business logic.

---

## Tier 1: `core/ui/components/` — Dumb UI Primitives

Pure presentational components. **No stores, no `useRootStore`, no `observer()`.**

### Subdirectories

| Directory | Contents |
|-----------|----------|
| `primitives/icon/` | SVG icon renderer |
| `primitives/spinner/` | Loading spinner |
| `primitives/inputs/` | Form controls (TextInput, NumberInput, SelectInput, CheckboxInput) |
| `feedback/error-screen/` | Full-page error with retry |
| `feedback/inline-error/` | Inline error with retry |
| `feedback/loading-screen/` | Full-page loading spinner |
| `layout/collapsible-menu/` | Expandable menu panel |
| `layout/context-menu/` | Right-click context menu for map tools |

### Rules
- Data and locale received via **props only** — no store access
- No `observer()` wrapper
- CSS Modules co-located with component
- Barrel: `core/ui/components/index.ts`

---

## Tier 2: `core/ui/composites/` — Reusable Smart Components

Self-contained components that may use stores, hooks, or complex internal state. **Reused across multiple features.**

| Directory | Contents |
|-----------|----------|
| `data-table/` | Virtual-scrolled attribute table (ex `AttributeTable`, renamed) |
| `measurement-panel/` | Measurement tools UI (distance, area) |
| `tool-panel/` | Generic container for layer tool panels |

### Rules
- Can use `useRootStore()` for store access
- Can wrap with `observer()`
- Imported by explicit path: `@core/ui/composites/data-table`
- Must accept locale via `dict` prop (no hardcoded i18n inside)

---

## Tier 3: `core/framework/ui/` — Infrastructure UI Containers

Application infrastructure that wires UI to stores and manages layout. **Single-use, tied to app shell.**

| Directory | Contents |
|-----------|----------|
| `widget-grid/` | Draggable/resizable widget overlay (`react-grid-layout`) |
| `map-tools-overlay/` | Map tool buttons + active tool panels |

### Rules
- Can use `useRootStore()` and `observer()` freely
- Imported by explicit path: `@core/framework/ui/widget-grid`
- Not exported from the `@core/ui/components` barrel

---

## Dependency Flow

```
components/ (dumb)  ←  composites/ (smart)  ←  framework/ui/ (infrastructure)
                              ↓
                      features (widgets/, map-tools/, ...)
```

Components in `components/` must not import from `composites/` or `framework/ui/`.
Components in `composites/` may import from `components/`.
Components in `framework/ui/` may import from `components/` or `composites/`.
