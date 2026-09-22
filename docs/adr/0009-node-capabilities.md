# ADR-0009: Node capabilities and protocols — the source/protocol/core boundary

## Context

The app renders external data sources as a layer tree on a map. Sources come in
different formats — STAC catalogs first, then WMS rasters, COPC point clouds, vector
tiles, feature services — and each format renders differently and offers different data
access. The core must treat every source uniformly: the tree, visibility, tools and the
map bridge work on nodes, not on formats. Two questions follow: how a node declares what
it can do, and who decides what that is.

A node can do more than render: it can expose an attribute table, offer styling tools,
or none of these. What a dataset offers is a fact about the source, not about the
protocol: a WMS layer may or may not carry attribute data behind a second API, and only
the source knows which. The protocol, in turn, only answers how data is requested. This
ADR records the boundary: the source assigns what a node can do (capabilities), the
protocol defines how each task's data is requested, and the core provides the
vocabulary, the verification and the menu.

## Decision

**A node names its protocols and its capabilities.** `LayerNode` carries two
`ProtocolBinding`s — `renderer` (required, map visualization) and `data` (optional,
attribute access) — and a capability list: `NodeCapability` entries
(`{toolId: string, slot: BindingSlot}`), where `slot` names which of the two
protocol bindings serves that capability. A binding is `{protocolId, sourceUrl,
params}`: the id resolves through the `ProtocolRegistry`, the URL is the base endpoint
without query parameters, and `params` is the single source of truth for
protocol-specific parameters — the protocol never parses query strings out of
`sourceUrl`. A capability is the id of a layer tool (ADR-0007); the vocabulary is open
strings because modules register their own tools. Capabilities play no part in
rendering: the snapshot follows the renderer binding alone.

**`renderer` and `data` are tasks, not capabilities.** The two slots name what the
protocol is used for on the node — the map renders through `renderer`, attribute access
goes through `data`. Capabilities are tool names assigned to the node. The slot union
(`BindingSlot`) lives in contracts, shared by the node model, the tool links and the
source modules.

**The source assigns capabilities; the core never does.** The source adapter is a parser
plus an assignment step that produces ready-to-show `TreeNode`s: per asset,
module-owned resolution rules pick one protocol per slot, the capability list, and may
attach a style. Protocol priorities exist only inside the module — the core owns no
resolver machinery and no priority semantics. A source that resolves several candidates
for one slot collapses them to one before creating the node; assets that fit neither
slot become `relatedObjects` entries of type `"report"`. Why the source and not the
core: the source knows its data best; the core never decides what a format looks like
or offers — it manages the tree, the visibility and the bridge to the map.

**Every assigned capability is verified at assignment.** The core exposes one pure
operation: a capability is implemented when a tool link `(protocolId of the node's
binding for that slot, that slot, toolId)` exists in the tool-link table (ADR-0007). A
capability whose slot has no binding on the node is unimplemented by definition — the
link cannot exist without the binding's protocol id. The adapter runs the check for
every capability at assignment, drops unimplemented ones and reports each via the
logger. Because tools and protocols register at bootstrap and nodes are created only
afterwards, the check always sees the complete link table — nothing registers
dynamically. A node therefore carries only capabilities that can work; the menu needs
no capability-level fallback, only a defensive skip for an unknown tool id. The skip
is defensive: links reference registered tools only (ADR-0007) and nothing
unregisters, so a verified capability always resolves; the skip exists only to guard
future registration changes.

**The menu follows the node's capabilities.** `getToolsForNode` resolves the node's
capabilities to tool instances in list order, deduplicated by id — the operation
returns tools only. The menu widget renders the node's report links after them (reports
travel in `relatedObjects`, ADR-0008); tool authoring and the link mechanism belong to
ADR-0007. The adapter controls the menu through assignment: a tool linked to the node's
protocol but not assigned never appears — that is the source's decision, not an
accident.

**The protocol is a data-request contract without resolution knowledge.** The
`Protocol<C>` interface declares identity (`id`, `label`), the style contract
(`defaultStyle`, `createRenderDescriptor` → a typed `RenderDescriptor<C>`), the
rendering backend (`getLayerAdapter()`), and optional hooks: `fetchAttributes`
(attribute queries) and `groupRenderUnits` (batching). Point queries are not a
protocol hook — they live on the `FeatureProvider` port collected by the
`FeatureProviderRegistry` (WMS's provider implements it; its GetFeatureInfo call
is an internal of that implementation). The interface
carries no role-resolution state: the descriptor never carries a role field — the
protocol that created it is the sole authority on how its config is interpreted — and
priority fields do not exist. Why per-protocol adapters: raster, vector and point cloud
need fundamentally different backends — native MapLibre layers versus the deck.gl
overlay — and a single adapter would branch internally by data type. Protocols of the
same data type reuse the shared adapters (`RasterAdapter`, `VectorAdapter`,
`GeoJsonAdapter`) — the precedent a new protocol follows.

**Style is a shared vocabulary, interpreted by the protocol.** `node.style` uses the
Mapbox GL style-layer vocabulary (`type`, `paint`, `layout`, `minzoom`, `maxzoom`,
`filter`, `metadata`) — no own generalized style standard is introduced, Mapbox is the
de-facto standard. The vocabulary is protocol-agnostic by rule: each protocol
interprets only the properties relevant to its rendering (`raster-opacity` becomes WMS
opacity, `circle-radius`/`circle-color` become point size and color scheme) and
silently ignores the rest; unknown keys are never validated because they are never
read. This is not a hard MapLibre coupling: the vocabulary is shared, and each protocol
translates it for its own render backend.

**The protocol guarantees a style.** `defaultStyle: LayerStyle` is a required field of
the protocol interface — a protocol without one does not compile — and
`createRenderDescriptor(sourceUrl, style?, params)` merges the node's style over the
default: `{...defaultStyle, ...style}`, provided keys win, nested objects replaced
wholesale. A source that cannot style its data simply omits the style; the guarantee
moves "protocol implements a style" from a runtime check to a type check.

**The protocol contract lives in `contracts/`; implementations live in their domain.**
`Protocol` and the read-only `ProtocolRegistry` port sit in
`contracts/domain/protocol.ts`: the contract has two kernel consumers — layer-tree
resolves descriptors through it, map builds render units — so the ≥2-consumers rule
puts it in the kernel. Protocol implementations, their adapters and their configs stay
in `domain/protocols/<id>/`. (An earlier revision of this ADR placed the interface in
the domain; it moved when the second consumer appeared, and the registry port followed.)

**Legend is metadata, not a model.** A node's `legend` is descriptive metadata; it
deliberately has no item model.

**Registration.** Built-in protocols register in `registerProtocols` during bootstrap,
before modules — which add their own through `context.protocolRegistry`. Duplicate ids
throw (ADR-0005). A node whose protocol id is unregistered stays in the tree and
produces no map layer — the snapshot excludes it — and the capability check at
assignment logs a warning for its capabilities; the tree marks such nodes as
unsupported (ADR-0008).

**Sources deliver layers invisible.** Sources deliver new layers invisible; the map
stays empty until the user opts in.

## Consequences

- A new source format arrives as a source adapter plus — rarely — a new protocol; the
  core changes never.
- What a node can do is data on the node, assigned by the source; the menu is derived by
  resolving ids, never by recomputing availability.
- Priority and resolution rules live in one module; the core has no role-resolution
  machinery to drift.
- A node's capability list is honest by construction: unimplementable capabilities never
  reach the menu.
- Trade-off: bindings and capabilities name protocols and tools by string id. A typo in
  a tool link fails loudly at startup (ADR-0007); a typo in a node's binding or an
  unimplementable assignment is caught at fetch time by the logger.
- Trade-off: the shared Mapbox vocabulary means protocols interpret the same keys
  differently — `raster-opacity` is meaningful to WMS and ignored by COPC; the
  interpreter, not the vocabulary, decides.
- The renderer/data split doubles the binding surface but keeps tasks separate: one
  protocol can serve both slots, and each capability names the slot that serves it.
