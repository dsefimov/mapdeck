# ADR-0017: Public helper subpaths — `mapdeck/ui` and `mapdeck/utils`

## Context

Extension modules build panels and compute output strings. Before this
decision the library exposed only the embed facade and the contracts barrel:
the UI kit (`@core/ui`) and the pure helpers (`@core/lib/geo/formatters`)
were internal, so a consumer module either duplicated the design system or
fell back to raw HTML. The `MapTool.icon` contract typed icons as plain
strings and pointed at the kit's `isIconName` for validation — the export
was implied but never shaped.

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

Why a new ADR rather than amending ADR-0014: that record governs how the
kit is *built* (CSS Modules, tokens, in-house interactions); this one
governs what the package *exposes* and promises to keep stable — a
different question with a different review check (the barrel test).

## Consequences

- Consumer panels share the design system instead of duplicating it; a
  token override in the host restyles built-in and extension panels alike.
- Adding a name to the barrels is a public API change and requires a dated
  note here; removing one is a breaking change.
- The subpath cannot grow store-driven components: the grid stays the only
  MobX-coupled kit piece and stays out.
