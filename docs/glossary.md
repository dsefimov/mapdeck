# Glossary

Definitions of domain terms used throughout the documentation and code. Public type
shapes are documented in [docs/api/extensions.md](api/extensions.md).

A layer tool acts on a single tree node; a map tool acts on the map as a whole. The two
entities are distinct: different stores, different availability rules, different ADRs.

## Extension

The general category: functionality registered into a running instance — a widget, a
layer tool, or a map tool. "Extension" names the kind; "module" names the delivery
unit (below). The two words are not interchangeable.

## Module

The unit of delivery and composition for extensions: a plain object with `id`, `name`
and `register(context)` passed to `createMapdeck({ modules })`. A module registers any
combination of widgets, layer tools, map tools, source adapters and protocols through
`ModuleContext`. The built-in example is the STAC integration. See
[docs/extending.md](extending.md) and ADR-0004.

## Widget

A panel extension rendered in the workspace grid; its layout and z-order persist for
the session. Tool panels are widgets too, but render over the map next to the toolbar
and follow the tool's active state instead of the grid's open/close state. See
[docs/api/extensions.md](api/extensions.md).

## Layer tool

An action for a single layer-tree node, rendered in the node's "More" menu. Availability
comes from the node's assigned capabilities, verified against the tool's protocol
bindings — see ADR-0007 and ADR-0009.

## Map tool

A map-level button in the toolbar. Either interactive — activating it opens its panel,
one tool active at a time — or an action, executing once on click. See ADR-0006.

## Layer node

A node of the layer tree: a group (a hierarchy element with children) or a layer (a
renderable dataset with protocol bindings, capabilities and a style override). Nodes
are source data, not presentation: expansion and menu state live in the widget's view
model. See ADR-0008.

## Protocol

The contract that defines how data for one format is requested and rendered. It carries
no resolution knowledge — priorities live in the core's asset-mapping rules
(ADR-0018). Point queries (feature info) are not a protocol hook: they live on the
`FeatureProvider` port. See ADR-0009 and [docs/api/protocols.md](api/protocols.md).

## Protocol binding

Which protocol serves a node slot: the protocol id, the base endpoint URL, and
protocol-specific parameters. A node carries two bindings: `renderer` (required, map
rendering) and `data` (optional, attribute access). See ADR-0009.

## Capability

A layer tool assigned to a node by the source, together with the node slot that serves
it. The source decides which capabilities a node gets; the core verifies each against
the tool-link table at assignment. See ADR-0009 and ADR-0007.

## Source adapter

The port an external data source implements to feed the layer tree: fetching the root
and children of the catalog hierarchy, one adapter per configured source type. The
adapter produces ready nodes — bindings, capabilities, styles — and routes its assets
through the asset mapping (ADR-0018). See ADR-0009 and
[docs/api/protocols.md](api/protocols.md).

## Asset

A tagged resource at a URL that a source adapter produces for the asset mapping: item
assets of a STAC item, or the equivalent in another source. Priority-ordered rules
claim each asset, slot fitness picks the binding, and slot-less assets become report
links. See ADR-0018.

## FeatureProvider

The port behind point queries (feature info on map click): it collects the features at
a map position for the protocols that implement one. Distinct from the protocol's
optional `fetchAttributes` hook, which feeds the attribute table. See ADR-0009.
