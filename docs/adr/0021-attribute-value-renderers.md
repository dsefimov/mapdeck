# ADR-0021: Attribute value renderers

Status: Accepted · Date: 2026-11-14

## Context

Attribute values arrive as opaque `unknown` records — no schema describes
them, and both display surfaces (the attribute table and feature info)
render every cell through one text formatter. Rich attribute kinds
(photographs first: a single photo and a photo album with a carousel)
therefore need two things: a way for a value to opt into rich rendering
by its own shape, and a place where per-kind rendering logic lives so
later kinds (links, dates, documents) add without the table learning
about them. The clicked value also needs somewhere big to be viewed —
without introducing the design system's first dialog, which ADR-0014
explicitly deferred.

## Decision

**A value opts in by its shape; a registry of renderers claims it.** The
contract (`AttributeValueRenderer`) pairs a `matches` predicate with a
compact `renderCell`, an optional `renderViewer`, and an optional
`toText`. The first registered renderer whose predicate accepts a value
wins — registration order is the precedence order. Built-ins (`photo`,
`album`, over `PhotoAttributeValue`/`AlbumAttributeValue` with a `kind`
tag) register in bootstrap before modules; a module registers its own
kinds through `context.attributeRenderers` and can shadow a built-in
through `{ override: true }` or a sharper predicate.

**The viewer is a widget window, not a dialog.** A cell preview's
`api.open` records the view on `AttributeValueStore` and opens the
built-in media viewer widget — a grid window opening at the full grid
size, with the standard window chrome (title, close, drag, resize) that
every widget already has. The widget renders the value through its
renderer's `renderViewer`: renderers return content, never chrome, and
ADR-0014's no-dialogs stance stands. The data table gains
`valueRenderers`/`onOpenValue` props (kit-side structural types,
mirroring the contract as `GeometryColumnConfig` does).

**Renderer strings come from the ambient dictionary.** Both cell and
viewer apis carry the core `dict`; a renderer declares the keys it reads
(the kit's local key-union pattern), so built-in and module renderers
localize without touching the contract's neutral surface.

## Consequences

- New attribute kinds are additive: a module defines a value shape and one
  renderer, and both surfaces (attribute table, feature info) pick it up —
  no table or panel changes.
- Match-by-shape is convention-based: a foreign JSON attribute that happens
  to satisfy a predicate renders through that renderer. Predicates must
  stay strict (required `kind` tag plus required field types); false
  positives degrade to the old text formatting only when no predicate
  matches.
- The `dict`-in-api pattern means the public contract carries a structural
  dictionary type rather than naming locale keys; the key set stays a
  renderer-local concern.
- The viewer inherits the widget grid's embedding story (it renders inside
  the host container, no portal over the host page) — the same reason a
  scrim-backed modal was rejected: an embedded instance must not dim the
  host's page.
- Table rows stay uniform: cell previews are height-clamped to the row, so
  the virtualization's one-row-height assumption keeps holding.
- Sorting still compares raw values (a JSON-ish string for rendered
  kinds); a per-kind sort key is a future contract extension, added when a
  real need appears.
