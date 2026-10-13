# ADR-0014: Design system policy — CSS Modules + semantic tokens, self-owned interactions

## Context

The UI layer serves two consumers at once: DOM components and the map
renderers. deck.gl and maplibre take colors as RGBA arrays and CSS strings,
and painted map objects must visually match the interface exactly — so both
resolve color from the same named CSS custom properties on `:root`
(`getThemeColor`). Component styling therefore needs one flat, machine-readable
source of truth. The interface itself lives over a live map canvas (widget
grid, tool panels, overlay slots) — a surface generic component catalogs do
not cover — and grows deliberately, one extension at a time.

## Decision

**One styling system: CSS Modules + flat semantic CSS tokens; dark theme via
`[data-theme]` attribute overrides. No CSS frameworks (Tailwind), no
css-in-js, no headless component dependencies (Radix).**

**Tokens are the shared kernel of DOM and map rendering.** Token values are
flat hex/px precisely so that `getComputedStyle` resolution stays trivial and
dependency-free; semantic names (`--color-accent`, tool tokens) keep themes
swappable without touching components.

**Components own their styles.** Each component ships a colocated
`*.module.css`; `cn()` joins conditional classes; inline styles are reserved
for genuine runtime dynamics (CSS-variable injection, store-driven z-index).

**Interaction engineering is in-house.** Tooltips, menus, focus management,
and collision positioning implement WAI-ARIA patterns directly, backed by unit
tests where logic is non-trivial. External solutions (Radix Primitives,
Floating UI, shadcn/ui) may be consulted as reference material when a question
has no answer in the existing codebase — reading material, never requirements,
defaults, or vendored code.

**UI dependencies require their own ADR.** Any runtime dependency touching UI
rendering or interaction is introduced only after a dedicated decision record.

**Amended 2026-10-13: the icon set is open.** The registry curates the
built-in names only; any other name renders the `--icon-<name>` token
directly (an inline mask-image in `Icon`, identifier-sanitized — names
that cannot be token suffixes render no glyph). Extension contracts keep
`icon: string`, and a module ships artwork by defining a token on its
container — the same gesture as any host token override, no registry
change. This completes the "artwork is a token" decision this ADR
already made; the registry remains for autocomplete and the
registry↔artwork sync test.

## Consequences

The token bridge stays trivial and the map always matches the chrome. Every
new interactive component carries its own accessibility and positioning
implementation cost — acceptable because the interactive surface is small,
grows slowly, and each pattern is written once in `core/ui`. Reference-based
reuse does not track upstream fixes; mitigated by treating external sources as
reading material rather than copied implementations. If product demands shift
toward heavy interaction widgets (dialogs, command palette) at scale, this
policy is revisited by a new ADR rather than eroded piecemeal.

Two consolidations the design review proposed are deliberate non-goals:
native `title=` attributes remain instead of a custom Tooltip component
(themeable tooltips are built when a real need appears — touch or
keyboard-focused users suffering), and the overlay sites share the
`--toolbar-width` token instead of a shared MapOverlay layer (a third
hand-rolled overlay reopens the question).
