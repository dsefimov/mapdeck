# Glossary

Domain terms used across the docs and the code. This file fixes the meaning of
terms that are specific to Mapdeck or easy to confuse; the types themselves are
the reference.

A layer tool acts on a single tree node; a map tool acts on the map as a whole. The two
entities are distinct: different stores, different availability rules, different ADRs.

## Layer tool

An action for a single layer-tree node, rendered in the node's "More" menu. Availability
comes from the node's assigned capabilities, verified against the tool's protocol
bindings — see `docs/adr/0007-layer-tools.md` and
`docs/adr/0009-node-capabilities.md`. Home store: `layerToolStore`.

## Map tool

A map-level button in the toolbar. Either interactive — activating it opens its panel,
one tool active at a time — or an action, executing once on click. See
`docs/adr/0006-map-tools.md`. Home store: `mapToolStore`.

## Protocol

The contract that defines how data for one format is requested and rendered: an `id`,
a `label`, a required default style, a render-descriptor factory, a layer adapter, and
optional hooks (`fetchAttributes`, `groupRenderUnits`). It carries no resolution
knowledge — priorities live in the core's asset-mapping rules (ADR-0018). Point
queries (feature info) are not a protocol hook: they live on the `FeatureProvider`
port. See `docs/adr/0009-node-capabilities.md`.

## Protocol binding

`{protocolId, sourceUrl, params}` — which protocol serves a node slot, the base
endpoint without query parameters, and protocol-specific parameters as the single
source of truth. A node carries two: `renderer` (required) and `data` (optional).
See `docs/adr/0009-node-capabilities.md`.

## Capability

A layer tool assigned to a node by the source, together with the node slot that serves
it: `{toolId, slot}`. The source decides which capabilities a node gets; the core
verifies each against the tool-link table at assignment. See
`docs/adr/0009-node-capabilities.md`.

## Source adapter

The port an external data source implements to feed the layer tree: `fetchRoot`,
`fetchChildren`, `initialize`, `dispose`; one adapter per configured source type. The
adapter produces ready nodes — bindings, capabilities, styles — and routes its assets
through the asset mapping (ADR-0018). See
`docs/adr/0009-node-capabilities.md`.
