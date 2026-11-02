# ADR-0012: Point-cloud data port at the protocol boundary

Status: Accepted · Date: 2026-09-22

## Context

Measure tools need read access to the cloud data a COPC layer has streamed: the volume
tool folds every loaded point into a grid computation, and picking reads one layer's
current points. The generic `LayerAdapter` exposes no typed access to loaded data, and
tools must not name a protocol id, cast to a concrete adapter class, or import protocol
internals.

## Decision

The capability becomes a contracts port next to the data it serves.
`contracts/domain/point-cloud.ts` declares `PointCloudDataAdapter`
(`getLoadedData(layerId)` / `getAllLoadedData()`) and
`toPointCloudDataAdapter`, a runtime-checked narrowing that returns
null when an adapter serves no clouds. `PointCloudAdapter` declares conformance
(`implements PointCloudDataAdapter`) — structural typing keeps the engine
unchanged. The protocol id has a single owner: `COPC_PROTOCOL_ID` in the copc
domain (`types.ts`). Tools read cloud data by capability
(`toPointCloudDataAdapter`), never by id: contracts provides the lookup that narrows
the adapters of every registered protocol, and the picking helpers consume the
port's data accessor plus the overlay's `pickObject`. Extensions import only
`@core/contracts` — never the copc barrel; the blind casts and deep imports are
gone from tools. The two layer tools `point-color-scheme` and `point-size-slider`
still bind to the literal `"copc"` as a registration key (ADR-0007); binding by
capability is deferred until a second point-cloud protocol exists.

## Consequences

One public contracts type pair more; the generic `ProtocolRegistry` stays
untouched — no per-protocol accessors leak into it. The runtime check replaces
compile-time fiction: a future adapter that drops either method fails loudly
(null) instead of silently breaking tool reads. A second cloud protocol later
gets the port by implementing two methods, with zero changes to consumers.
The pattern (capability port + checked narrowing + id constant owned by its
domain) is the precedent for any future tool-facing protocol capability.

