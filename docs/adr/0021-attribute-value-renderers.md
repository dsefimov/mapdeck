# ADR-0021: Attribute value renderers

Status: Accepted · Date: 2026-11-14

## Context

Attribute values arrive as opaque `unknown` records — no schema describes
them, and both display surfaces (the attribute table and feature info)
render every cell through one text formatter. Rich attribute kinds
(photographs first: a single photo and a photo album with a fullscreen
carousel) therefore need two things: a way for a value to opt into rich
rendering by its own shape, and a place where per-kind rendering logic
lives so later kinds (links, dates, documents) add without the table
learning about them. The fullscreen viewer is also the design system's
first dialog: ADR-0014 deferred focus trapping and dialog semantics
because no component needed them, and required a new ADR rather than
piecemeal erosion when one appears.

## Decision

**A value opts in by its shape; a registry of renderers claims it.** The
contract (`AttributeValueRenderer`) pairs a `matches` predicate with a
compact `renderCell`, an optional fullscreen `renderViewer`, and optional
`toText`/`describe`. The first registered renderer whose predicate accepts
a value wins — registration order is the precedence order. Built-ins
(`photo`, `album`, over `PhotoAttributeValue`/`AlbumAttributeValue` with a
`kind` tag) register in bootstrap before modules; a module registers its
own kinds through `context.attributeRenderers` and can shadow a built-in
through `{ override: true }` or a sharper predicate.

**The system supplies the dialog.** The workspace-level
`AttributeValueViewerLayer` wraps every renderer's viewer content in one
kit `Lightbox` shell (portal, scrim, Escape, close button, focus restore,
Tab cycle, `role="dialog"`). Renderers return content, never chrome — this
is the ADR-0014 revisit: dialog semantics exist once, in the kit, not per
extension. The data table gains `valueRenderers`/`onOpenValue` props
(kit-side structural types, mirroring the contract as `GeometryColumnConfig`
does); a cell preview's `api.open` sets the single observable view on
`AttributeValueStore`, which the layer renders.

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
- The Lightbox portals to `document.body`, like `ContextMenu`: under
  shadow-DOM embedding the tokens travel with `:root`, which holds today
  and is the same known limitation the menu already has.
- Table rows stay uniform: cell previews are height-clamped to the row, so
  the virtualization's one-row-height assumption keeps holding.
- Sorting still compares raw values (a JSON-ish string for rendered
  kinds); a per-kind sort key is a future contract extension, added when a
  real need appears.
