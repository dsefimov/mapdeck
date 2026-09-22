# ADR-0012: Point-cloud data port at the protocol boundary

## Context

Measure tools need read access to the cloud data a COPC layer has streamed:
the volume tool folds every loaded point into a grid computation, and the
picking path reads one layer's current points. The protocol port
(`Protocol.getLayerAdapter(): LayerAdapter`) exposes none of that generically —
`LayerAdapter.getLoadedData?` returns `unknown` and `getAllLoadedData` is not
declared at all. Tools therefore reached through the boundary with three
leaks: the magic literal `"copc"`, a blind `as PointCloudAdapter` cast onto a
concrete class, and deep imports into `protocols/copc/adapter/` and
`engine/`, bypassing the domain barrel. Every new cloud-consuming tool would
copy all three.

## Decision

The capability becomes a contracts port next to the data it serves.
`contracts/domain/point-cloud.ts` declares `PointCloudDataAdapter`
(`getLoadedData(layerId)` / `getAllLoadedData()`) and
`toPointCloudDataAdapter`, a runtime-checked narrowing that returns
null when an adapter serves no clouds. `PointCloudAdapter` declares conformance
(`implements PointCloudDataAdapter`) — structural typing keeps the engine
unchanged. The protocol id literal gets a single owner: `COPC_PROTOCOL_ID`
lives in the copc domain (`types.ts`) and is used by `CopcProtocol` — but by no
tool. Tool access is capability-based: contracts provides the lookup that narrows
the adapters of every registered protocol, and the picking helpers consume the
port's data accessor plus the overlay's `pickObject`. Extensions import only
`@core/contracts` — never the copc barrel (the repository's "contracts only"
rule has no exceptions); the blind casts and deep imports are
gone from tools. Two layer-tools (`point-color-scheme`, `point-size-slider`)
still name the `"copc"` id when binding themselves to a protocol — a
registration key in the ADR-0007 id-string sense, not a type cast. The
capability-based alternative (binding tools by adapter capability instead of
protocol id) is deferred until a second point-cloud protocol exists and the
string stops being obviously correct.

## Consequences

One public contracts type pair more; the generic `ProtocolRegistry` stays
untouched — no per-protocol accessors leak into it. The runtime check replaces
compile-time fiction: a future adapter that drops either method fails loudly
(null) instead of silently breaking tool reads. A second cloud protocol later
gets the port by implementing two methods, with zero changes to consumers.
The pattern (capability port + checked narrowing + id constant owned by its
domain) is the precedent for any future tool-facing protocol capability.

