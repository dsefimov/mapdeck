# Routing & Page Composition

## No Routing

Mapdeck is a **single-page, single-workspace application**. There is no routing library, no URL-based navigation, and no multiple pages.

The entire app renders one view: `MapWorkspace`.

---

## App Layout

```
App.tsx
  └─ LoadingScreen          (while initializing)
  └─ ErrorScreen            (on init failure, with retry)
  └─ MapWorkspace           (once initialized)
       ├─ Sidebar           (left: icon buttons for widgets)
       └─ Map area          (right: fills remaining space)
            ├─ MapViewer    (always visible, renders the map)
            └─ WidgetGrid   (floating panels overlay)
```

### MapWorkspace

The workspace is a full-viewport flexbox layout using CSS Modules (`MapWorkspace.module.css`):

| Region | CSS Module class | CSS | Content |
|--------|-----------------|-----|---------|
| Root container | `mapWorkspace` | `100vw × 100vh`, `display: flex` | Root flex container |
| Sidebar | — | fixed width | `Sidebar` — icon buttons |
| Main content | `mainContent` | `flex: 1` | Column container |
| Map area | `mapArea` | `flex: 1`, `position: relative` | `MapViewer` + `WidgetGrid` |

Source: `src/app/workspace/`

---

## Widget Overlay System

Instead of navigating between pages, users interact with **floating widget panels**:

- **Sidebar** buttons toggle widgets via `rootStore.overlayStore.openWidget(id)` / `closeWidget(id)`
- **WidgetGrid** renders open widgets as draggable/resizable panels (`react-grid-layout`)
- **Widget-local state** persists across open/close cycles via `getWidgetStore(id, factory)`
- **Z-ordering** is managed by `bringToFront(widgetId)`

The `MapViewer` widget is always visible and never goes through the overlay system.

---

## Related

- [widgets.md](./widgets.md) — How to add a widget
- [map-tools.md](./map-tools.md) — How to add a map tool
