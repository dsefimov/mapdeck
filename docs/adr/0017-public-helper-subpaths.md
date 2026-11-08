# ADR-0017: Public helper subpaths

Status: Accepted · Date: 2026-10-13

## Context

Extension modules build panels and compute output strings. The embed facade and the
contracts barrel alone would force a consumer module to duplicate the design system or
fall back to raw HTML, so the UI kit (`@core/ui`) and the pure helpers
(`@core/lib/geo/formatters`) need a public, shaped surface. `MapTool.icon` is a plain
string validated by the kit's `isIconName`, which therefore has to be exported too.

## Decision

Two package entry points, each a thin barrel in `src/app/` (the `app/contracts.ts`
precedent) with its own lib-build entry:

- **`mapdeck/ui`** — the panel-building surface: primitives (buttons, inputs, `Icon`,
  `Text`, `Field`, `Spinner`), panel composites (`ToolPanel`, `SegmentsList`,
  `DataTable`, `ColorPicker`, `SummarySection`), interaction hooks (`useClickOutside`,
  `useEscapeKey`, `useMenuKeyboard`, …), and the theme helpers (`getThemeColor`,
  `DEFAULT_ACCENT_CSS`, `useMeasureColors`, …). Everything styles through the
  `mapdeck/styles.css` tokens; there is no separate `ui.css`.
- **`mapdeck/utils`** — pure helpers, no React, no stores: the geo formatters
  (`formatDistance`, `formatArea`, `formatVolume`, `geoPointToLngLatZ`).
  Point-cloud picking helpers travel through `mapdeck/contracts` and stay there.

The composition of `mapdeck/ui` is a stability contract, guarded by a unit test:
application chrome — the widget grid (`WidgetGrid`, `WidgetShell`) and boot screens
(`ErrorScreen`, `LoadingScreen`, `ErrorBoundary`) — stays internal; those render
inside the library's own root component and are not a consumer surface. The export
inventory is documented in [docs/api/extensions.md](../api/extensions.md).

`mapdeck/ui` vocabulary is domain-free by construction: `ContextMenu` speaks
`items: ContextMenuItem[]` with `activeItemId` (the host maps its own tool
objects into them); `SelectInput` takes a single `options: SelectOption[]`
array where a `group` field labels section runs; `CollapsibleMenu` fills
through `children` alone; `SummarySection` marks rows with `marker`. The kit
is store-free — the widget grid takes plain props and the composition root
wires the widget store. `SelectInput` and `ColorPicker` take the core `dict`
for their chrome strings; the input primitives (`TextInput`, `NumberInput`,
`SliderInput`, `SwitchInput`, `CheckboxInput`) accept `ariaLabel`.

## Consequences

- Consumer panels share the design system instead of duplicating it; a token override
  in the host restyles built-in and extension panels alike.
- The subpaths follow the package's SemVer policy (ADR-0019): adding a name to the
  barrels is a minor change and requires a dated note here; removing one is breaking.
- The subpath cannot grow store-driven components: the kit is store-free and
  stays that way.
