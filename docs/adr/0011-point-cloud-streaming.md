# ADR-0011: COPC rendering

Status: Accepted · Date: 2026-09-22 · Updated: 2026-11-04 (worker decode, decoded-node
LRU, distance-ranked eviction, two-part frames)

## Context

Point clouds are the only format the application streams. A COPC file can hold billions
of points, and the browser must render the slice the camera justifies: the visible
octree nodes at their screen-space resolution. Fetching everything is impossible, so the
engine keeps a bounded cache, loads nodes on demand, evicts them by use, and draws a
committed base layer plus a small streaming part — never one layer per node. The engine
lives entirely inside the COPC protocol (`domain/protocols/copc/engine/`). The rest of
the core sees none of it: the map sees a render unit that survives visibility toggles
and keeps streaming while hidden (ADR-0010), the tree sees a node, tools see features.

The product constraint is metric CRS: deployment targets work in metric coordinate
systems, so spacing is read as meters throughout. Foot-based files are accepted to
degrade (the LOD over-resolves ~3.3×), and files carrying their CRS only in GeoTIFF keys
rather than WKT are treated as WGS84. The consumer-facing requirements — CRS, HTTP range
requests, CORS, the WebAssembly decoder — are documented in
[docs/api/protocols.md](../api/protocols.md).

## Decision

**The engine is a cycle: select, evict, plan, load, render.** A debounced camera change
triggers one cycle. The camera position, the active viewport and the frustum planes are
read through the map context (ADR-0010); the engine names no deck import. Cycles are
single-flight: a request that arrives mid-cycle supersedes it, and a failed cycle
recovers into the next request. The cycle traverses the octree top-down and selects
nodes by screen-space error, cancels stale loads, evicts, plans a load batch within the
budget, awaits the drain, and commits the render. The traversal, priority, geometry and
eviction algorithms live in `engine/` with colocated tests; the decisions that outlive
their code:

- The hierarchy loads lazily, one page per request — the first points render after the
  root page, not a full-tree walk.
- Distances are meters throughout; degree-valued spacing converts at the extent's center
  latitude; screen-space error is divided by the device pixel ratio.
- Priority is a single comparable number — foveated selection dominates, depth breaks
  ties.

**Budget is counted in points, and eviction serves the current view.** The point budget
caps the total points across loaded and loading nodes; the adapter sets the baseline
once at initialization. Eviction runs before planning, targets the unmet demand of the
current candidates, and ranks victims farthest from the viewport rectangle first; this
cycle's candidates are untouchable, and a loaded parent whose region is still loading
stays as the fallback renderer. Evicted nodes move to a byte-budgeted decoded-node
cache; a reload restores the payload without refetch or decode.

**The render path is a two-part frame: a committed base plus a streaming part.** After
each cycle's drain the executor computes the visible set — the frustum pass, then the
SSE pass — and packs per-node typed arrays into contiguous buffers. The base envelope
keeps its object reference between pushes, so a renderer holding it skips the re-upload;
nodes streamed since the last commit pack into a small incoming part, and a commit folds
the incoming part into a fresh base. There are no per-node deck layers; picking
normalizes back to the tree layer id (`stripPointCloudLayerSuffix` in contracts). Frame
envelopes are views into pool-owned memory, valid until the next push (the contract on
`PointCloudFrame`).

**Decode runs in a worker pool; reads are bounded.** The main thread only fetches a
node's compressed bytes; laz-perf decompression, raw extraction, reprojection and color
derivation run in workers. Every read goes through bounded getters that rebuild
copc.js's range wire format, giving each request a ceiling and a real `AbortError` on
cancellation; copc.js's own fetch path is never used. Range requests bypass the HTTP
cache — browser disk caches intermittently fail ranged responses. The wasm URL is
absolutized against the page (inline-blob workers cannot resolve relative URLs). A
wedged worker is terminated and replaced; dispose rejects everything still pending.

**Failures: report once, then the channels take over.** An initialization failure
reports through `reportLayerError`. An `addToMap` failure destroys the unit and rethrows
into the layer manager's failed-unit channel (ADR-0010). A runtime load failure marks
the node errored — protected from eviction — and retries with exponential backoff that
resets on success. Cancellation aborts the in-flight range request; one in-flight load
per node key.

**Picking works through the overlay port.** A feature provider implements the shared
`FeatureProvider` contract over the port's `pickObjects`/`pickObject` queries,
extracting the picked point from the packed buffers and falling back to the picked
GeoJSON object for non-point layers.

## Consequences

- The engine is invisible to the rest of the core: the map sees an adapter and a unit,
  the tree sees a node, tools see features. The streaming implementation can change
  without touching `map/`.
- One cycle per camera change bounds work: bursts of viewport events collapse into a
  single traversal, and intermediate requests never queue up.
- Memory is bounded in points, not nodes; evicted bytes rest in the decoded-node LRU up
  to its own byte budget — a revisit restores without a refetch.
- Hidden clouds keep streaming — the engine keeps fetching while the layer is hidden, so
  a re-shown cloud is already current, and the adapter re-creates the deck layers from
  retained data at once on show (ADR-0010).
