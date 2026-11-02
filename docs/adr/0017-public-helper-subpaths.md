# ADR-0017: Public helper subpaths — `mapdeck/ui` and `mapdeck/utils`

Status: Accepted · Date: 2026-10-13

## Context

Extension modules build panels and compute output strings. The embed facade and the
contracts barrel alone would force a consumer module to duplicate the design system or
fall back to raw HTML, so the UI kit (`@core/ui`) and the pure helpers
(`@core/lib/geo/formatters`) need a public, shaped surface. `MapTool.icon` is a plain
string validated by the kit's `isIconName`, which therefore has to be exported too.

## Decision

Two new package entry points, each a thin barrel in `src/app/` (the
`app/contracts.ts` precedent) with its own lib-build entry:

- **`mapdeck/ui`** — the panel-building surface: primitives (buttons,
  inputs, `Icon`, `Text`, `Field`, `Spinner`), panel composites
  (`ToolPanel`, `SegmentsList`, `DataTable`, `ColorPicker`,
  `SummarySection`), interaction hooks (`useClickOutside`, `useEscapeKey`,
  `useMenuKeyboard`, …), and the theme helpers (`getThemeColor`,
  `DEFAULT_ACCENT_CSS`, `useMeasureColors`, …). One CSS chain: everything
  styles through the existing `mapdeck/styles.css` tokens — there is no
  separate `ui.css`.
- **`mapdeck/utils`** — pure helpers, no React, no stores: the geo
  formatters (`formatDistance`, `formatArea`, `formatVolume`,
  `convertPointToDegrees`). Point-cloud picking helpers already travel
  through `mapdeck/contracts` and stay there.

The composition of `mapdeck/ui` is a stability contract, guarded by a unit
test: application chrome — the widget grid (`WidgetGrid`, `WidgetShell`,
store-driven, the kit's only MobX coupling) and boot screens
(`ErrorScreen`, `LoadingScreen`, `ErrorBoundary`) — stays internal; those
render inside the library's own root component and are not a consumer's
surface.

## Consequences

- Consumer panels share the design system instead of duplicating it; a
  token override in the host restyles built-in and extension panels alike.
- Adding a name to the barrels is a public API change and requires a dated
  note here; removing one is a breaking change.
- The subpath cannot grow store-driven components: the grid stays the only
  MobX-coupled kit piece and stays out.
