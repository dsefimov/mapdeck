# Glossary

Domain terms used across the docs and the code. The code, its types and tests are the
source of truth; this file fixes the meaning of terms so the docs stay unambiguous.

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
optional hooks (`fetchAttributes`, `groupRenderUnits`). It carries no
resolution knowledge — priorities live with the source adapter that produces the
nodes. Point queries (feature info) are not a protocol hook: they live on the
`FeatureProvider` port. See `docs/adr/0009-node-capabilities.md`.

## Protocol binding

`{protocolId, sourceUrl, params}` — which protocol serves a node slot, the base
endpoint without query parameters, and protocol-specific parameters as the single
source of truth. A node carries two: `renderer` (required) and `data` (optional). See
`docs/adr/0009-node-capabilities.md`.

## Capability

A layer tool assigned to a node by the source, together with the node slot that serves
it: `{toolId, slot}`. The node's menu is its capability list; the source decides which
capabilities a node gets, and the core verifies each against the tool-link table at
assignment. See `docs/adr/0009-node-capabilities.md`.

## Render descriptor

A protocol-typed configuration for rendering one layer: `RenderDescriptor<C>` is
`{sourceUrl, config}`. A node's snapshot resolves its renderer binding to a descriptor
through the protocol's `createRenderDescriptor` — node style merged over the protocol
default. See `docs/adr/0009-node-capabilities.md`; how the resolved descriptors drive
the map is `docs/adr/0010-map-overlay-render-pipeline.md`.

## Render unit

A batch of layer nodes rendered together through one layer adapter; a protocol may
group render units (e.g. WMS batching). See `src/core/contracts/domain/render.ts` and
`docs/adr/0010-map-overlay-render-pipeline.md`.

## Overlay

The second render backend: deck.gl layers drawn over the MapLibre map. The map domain
never imports deck directly — consumers reach the overlay only through the
`OverlayManager` port. See `docs/adr/0010-map-overlay-render-pipeline.md`.

## MapContext

`{map, overlayManager, reportLayerError?}` — the handoff the map gives to every
adapter call: the MapLibre instance, the overlay port, and an optional error channel
into the layer manager. Camera queries (`getCameraPosition`, `getActiveViewport`,
`getFrustumPlanes`) are optional members here when a map is attached — adapters do
not reach back into the map store for them. Built atomically by `MapStore` when a
map exists. See `docs/adr/0010-map-overlay-render-pipeline.md`.

## Point-cloud data port

The contracts pair (`PointCloudDataAdapter` plus a registry-wide lookup) through
which tools reach loaded cloud data and point picking without naming a protocol —
access by capability, not by id. See `docs/adr/0012-point-cloud-data-port.md`.

## FeatureRow

The tabular shape of one geographic feature: data columns plus reserved
underscore-prefixed keys (`_bbox`) carrying the spatial metadata the generic table
needs. Writers produce plain objects; the reader side is compiler-checked, the
writer side is kept honest by the contract's tests. See
`docs/adr/0013-feature-row-contract.md`.

## Tech layer

Transient drawing geometry a map tool owns — measurement lines, area outlines,
preview markers. Typed specs live in `TechLayerStore` (a pure state container)
and are rendered at the overlay seam by the tech-layer renderer with theme
colors injected from the caller. A tech layer is not a tree node and not a
render unit; protocols never see it.

## StateStore

Instance-scoped storage for interaction controllers: `stateStore.get(instanceId,
factory)` hands each tool/widget instance its view model (the ADR-0002 case-2
pattern) and the root store's disposal clears them (ADR-0003).

## Source adapter

The port an external data source implements to feed the layer tree: `fetchRoot`,
`fetchChildren`, `initialize`, `dispose`; one adapter per configured source type. The
adapter produces ready nodes — bindings, capabilities, styles — and owns all role and
priority resolution. See `docs/adr/0009-node-capabilities.md`.
