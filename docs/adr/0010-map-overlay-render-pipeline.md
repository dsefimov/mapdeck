# ADR-0010: Map rendering — the overlay port and the snapshot-to-map sync loop

Status: Accepted · Date: 2026-09-22

## Context

The map domain turns the layer tree's snapshot into rendered layers. Rendering happens
on two backends: native MapLibre layers (raster and vector formats) and a deck.gl overlay
(point clouds). The core must treat both uniformly — the tree, the tools and the sync
loop work on nodes, not on backends — so the render pipeline may know neither protocols nor
deck.gl: its input is the structural snapshot (ADR-0008), resolved to descriptors by the
tree, and its output passes through two narrow ports. The sync problem is the hard part:
the manager must keep registered render units exactly equal to the snapshot while
minimizing churn — a visibility toggle or a style edit must not tear down and rebuild a
layer whose backend holds loaded data, such as a streamed point cloud. This ADR records
the port, the contracts and the sync loop.

## Decision

**The map knows protocols only through contracts.** The map domain imports no protocol
code. Its input is the snapshot, resolved to typed descriptors by the tree; its output
goes through `LayerAdapter` per render unit and the `OverlayManager` port. deck.gl
enters the core through the port's contract signature (`Layer`, `Viewport`,
`PickingInfo` types in `contracts/domain/map-context.ts`); the port's only
implementation — `DeckOverlayManager` — lives behind `map/adapters/overlay/`, and the
render pipeline itself — the layer manager and the sync loop — never imports deck.
Every other deck touchpoint — protocol layer factories, the tech-layer renderer, the
COPC engine's viewport — draws or reads through the port. Protocol implementations
receive `MapContext` from the map: the flow is map → protocol adapter, never the
reverse.

**The overlay is a port, not a dependency.** `OverlayManager`
(`contracts/domain/map-context.ts`) is the thin port for the second backend:
attach/detach, layer lifecycle (`addLayer`, `removeLayer`, `updateLayer`,
`setLayerVisibility`), and queries (`getMap`, `pickObject`, `pickObjects`).
Two kinds of consumers use it: the render pipeline (the point-cloud adapter draws
through it) and map tools (measurement and marker layers attach through it directly,
outside the layer manager). `DeckOverlayManager` implements the port over a
`MapboxOverlay` in interleaved mode; property updates are batched through a microtask so
a burst of changes produces one `setProps` per flush of the microtask queue, and picking
queries are answered from public MapLibre state.

**MapContext is the single handoff to adapters.** `MapContext` is
`{readonly map, readonly overlayManager, readonly reportLayerError?,
getCameraPosition?, getActiveViewport?, getFrustumPlanes?}`. The camera queries —
position, active viewport, frustum planes — are properties of the map, answered from
public MapLibre state, so they live on the context rather than on the overlay port:
protocol engines (COPC's viewport manager) ask about the camera through them without
importing deck, and a second overlay implementation is spared camera math it does not
own. MapStore builds the context atomically when a map exists, and adapters receive it
per method call. The
manager-provided context always supplies `reportLayerError` — a closure into
`LayerManager.handleLayerError`; adapters call it defensively and log the failure
themselves in all cases, because the channel is transport: the map does not own protocol
errors, it relays them.

**The snapshot resolves descriptors; unrenderable ones are excluded.** The tree's
`toSnapshotItems` resolves each layer node's renderer binding through
`protocol.createRenderDescriptor` (node style merged over the protocol default —
ADR-0009) and skips nodes whose protocol id is not registered or whose resolved
descriptor has an empty source URL. An unrenderable node stays in the tree and produces
no map layer; the exclusion itself is silent — the render pipeline reports nothing — but
the tree marks such nodes as unsupported, so an inert node is visible as inert
(ADR-0008). A broken assignment is a source-side defect: the source adapter owns its
diagnostics (the ADR-0009 assignment check covers the unregistered-protocol case).
Descriptors are computed values, never stored on the
node. The snapshot stays the single signal: the layer manager reacts to
`treeStore.layerSnapshot` and to nothing else.

**Render units: one node becomes one unit; grouping is protocol-owned.** A render unit
is `{id, nodeIds, protocolId, adapter, descriptor}` — the batch of nodes drawn together
through one adapter. The pipeline builds one unit per visible node, then offers the
result to every protocol's optional `groupRenderUnits` hook, which mutates the unit
map: WMS groups consecutive nodes sharing a group key (base URL, version, opacity)
into one capped raster unit with a combined tile URL. Grouping semantics live
entirely in the protocol; the manager applies whatever the map contains after the
hooks.

**The sync loop: classify, then apply in a fixed order.** `classifyRenderUnitChanges`
diffs the current units against the desired units and the snapshot's visibility into
five sets — added, removed, shown, hidden, updated — applied in a fixed order
(removed, added, shown, updated, hidden, then failed-unit refresh and native
z-order). The central semantic: a visibility-only change never tears a unit down —
"hidden" retains the unit, "shown" re-shows it without a re-add — loaded resources
survive toggles. The no-teardown guarantee is per unit: a change that alters group
membership recreates the group. Accepted: grouped units are raster layers without
loaded resources; the guarantee exists for backends that hold loaded data (point
clouds), which are never grouped. A descriptor change on a live unit yields
"updated": descriptors are immutable by construction, and `updateConfig` mutates
backend state, not the descriptor — the adapter may update visual properties in
place, otherwise it falls back to remove+add.

**The sync loop is a reaction.** The manager observes the snapshot with
`fireImmediately: true` and runs one full sync per change; MobX transaction batching
coalesces bursts.

**The sync waits for the map to load.** The manager initializes once; the sync no-ops
until the map fires `load` (or reports itself already loaded), then runs one full sync.
Why: adding layers to a half-initialized map produces noise and races.

**Async failures: report, unregister, gated retry, per-node errors.** When an add
throws or a unit reports failure through `reportLayerError`, the manager logs,
unregisters the unit, records it as failed, and surfaces a per-node render error in
the tree (`treeStore.reportRenderError` — the render channel of ADR-0008); a successful
add or remove clears the node's error. An update failure is lighter: the manager logs
it and keeps the unit registered with its previous descriptor; when the descriptors
still differ on the next sync, the unit is classified as updated again — that is the
retry. A failed unit re-adds only when something changed that could fix it — its
nodes were hidden at the last refresh, or its descriptor differs — never in a blind
loop.

**MapStore owns the map lifecycle.** `setMap` disposes the previous layer manager,
attaches the overlay, and constructs the manager with
`{map, overlayManager, reportLayerError}`; `dispose` reverses the sequence. The context
getter assembles `MapContext` atomically when a map exists — adapters never see a
half-constructed context.

**Native layers follow tree order.** Adapters declare `nativeLayerOrdering`; after each
sync the manager walks the snapshot's tree order and calls `map.moveLayer` for those
adapters' units. deck.gl units are unaffected — the overlay owns its own order. Why:
MapLibre's native order is the z-order, and the tree order is the only order the core
owns.

## Consequences

- A new rendering backend is a protocol plus an adapter behind the same two
  ports; `map/` never changes for a new format.
- Hidden units retain loaded data; the streaming consequences — background fetching
  and memory cost for invisible layers — are recorded in ADR-0011.
- The manager is a full-diff reconciler: every sync pass walks the whole snapshot.
  Accepted at current layer counts; transaction batching is the only coalescing.
- Render failures are visible in the tree per node, not only in the console.
- Trade-off: `reportLayerError` is optional on the contract, so an adapter never fails
  when a context lacks it; adapters therefore always log their failures themselves and
  treat the channel as best-effort transport.

