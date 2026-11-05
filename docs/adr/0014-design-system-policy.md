# ADR-0014: UI styling and interaction

Status: Accepted · Date: 2026-09-22

## Context

The UI layer serves two consumers at once: DOM components and the map renderers.
deck.gl and MapLibre take colors as RGBA arrays and CSS strings, and painted map
objects must visually match the interface — so both resolve color from the same named
CSS custom properties on the theme root (`getThemeColor`): `:root` for a full page,
`.mapdeck-root` for an embedded instance, which points the reader at its container via
`setThemeRoot` — one theme root per page. Component styling therefore needs one flat,
machine-readable source of values. The interface itself lives over a live map canvas
(widget grid, tool panels, overlay slots) — a surface generic component catalogs do not
cover — and grows one extension at a time.

## Decision

**One styling system: CSS Modules + flat semantic CSS tokens; dark theme via
`[data-theme]` attribute overrides. No CSS frameworks (Tailwind), no CSS-in-JS, no
headless component dependencies (Radix).**

**Tokens are shared between DOM and map rendering.** Token values are flat hex/px so
that `getComputedStyle` resolution stays simple and dependency-free; semantic names
(`--color-accent`, tool tokens) keep themes swappable without touching components. The
theme tokens and the `mapdeck/ui` theme helpers (`getThemeColor`, `subscribeTheme`)
are the public customization surface for hosts and modules; component `*.module.css`
classes are private implementation.

**Components own their styles.** Each component ships a colocated `*.module.css`;
`cn()` joins conditional classes; inline styles are reserved for runtime dynamics
(CSS-variable injection, store-driven z-index).

**Interaction is implemented in-house.** Interactive components implement WAI-ARIA
patterns directly — menus and selects carry the keyboard navigation and roles — with
unit tests for the non-trivial logic. This is a dependency decision: no headless UI
runtime (Radix Primitives, Floating UI, shadcn/ui) is introduced for interaction;
external sources serve as reference reading, not as vendored code. Tooltips remain
native `title` attributes until a themeable tooltip is needed.

**UI dependencies require their own ADR.** Any runtime dependency touching UI rendering
or interaction is introduced only after a dedicated decision record. The one dependency
on record, `react-grid-layout` (the widget grid layout engine), is covered by the core
dependency policy (ADR-0020).

**The icon set is open.** The registry curates the built-in names; any other name
renders the `--icon-<name>` token (an inline mask-image in `Icon`; names that cannot be
token suffixes render no glyph). Extension contracts keep `icon: string`, and a module
ships artwork by defining a token on its container — a host token override, with no
registry change. The registry serves autocomplete and the registry↔artwork sync test.

## Consequences

- Map rendering and DOM chrome resolve the same token values, so themes apply to both.
- Every new interactive component carries its own accessibility and positioning
  implementation cost — accepted because the interactive surface is small and each
  pattern is written once in `core/ui`. Reference-based reuse does not track upstream
  fixes; external sources stay reading material.
- Keyboard support covers the implemented patterns (menu navigation, listbox selects,
  Escape dismissal); focus trapping and dialog semantics are not implemented, because
  no current component needs them. Accessibility claims in documentation follow the
  implementation, and the release checklist re-verifies the keyboard paths (see
  CONTRIBUTING).
- If product demands shift toward heavy interaction widgets (dialogs, command palette)
  at scale, this policy is revisited by a new ADR rather than eroded piecemeal.
- Native `title=` tooltips and the shared `--toolbar-width` token (instead of a shared
  overlay layer) are deliberate non-goals; both are reopened when a concrete need
  appears.
