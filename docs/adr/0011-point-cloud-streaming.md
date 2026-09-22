# ADR-0011: Point-cloud streaming — the COPC engine

## Context

Point clouds are the only format the app streams. A COPC file can hold billions of
points, and the browser must render exactly the slice the camera justifies: the visible
octree nodes at their screen-space resolution. Fetching everything is impossible, so
the engine keeps a bounded cache, loads nodes on demand, evicts them by use, and draws
one deck.gl layer that is updated in place — never one layer per node. The engine lives
entirely inside the COPC protocol (`domain/protocols/copc/engine/`). The rest of the
kernel sees none of it: the map sees a render unit that survives visibility toggles and
keeps streaming while hidden (ADR-0010), the tree sees a node, tools see features. This
ADR records how the engine is structured — the cycle that drives it, the traversal that
selects nodes, the budget that bounds memory, the render path that packs the result —
and where its seams are.

**The product constraint is metric CRS only.** Deployment targets work
exclusively in metric coordinate systems. Foot-based files are accepted
to degrade (spacing is read as meters, so the LOD over-resolves ~3.3× — the
demo's foot-based Autzen carries this knowingly), and files carrying their
CRS only in GeoTIFF keys rather than WKT are treated as WGS84. The first
non-metric or GeoTIFF-keys file in real target data reopens this.

## Decision

**The engine is a cycle: select, plan, evict, load, render.** A camera change triggers
one cycle. `ViewportManager` listens to the map: `moveend`/`zoomend`/`pitchend`
debounced 150 ms start a traversal, raw `move` events only store the camera snapshot.
The camera position, the active viewport and the frustum planes are read through
the map context (ADR-0010) and the viewport type flows from the context's
return types; the vertical FOV and the screen height are read directly from the map
and the window; the engine names no deck import. `selectNodesSSE` enters a
single-flight FSM (`CycleRunner`): a request that arrives mid-cycle marks the loop
dirty and collapses into one more cycle after the current one; a failed cycle recovers
into the next request. `CycleExecutor` then runs the fixed pipeline: traverse, cancel
stale loads, plan the budget, evict, enqueue the load batch, await the drain, refresh
the render, notify through `onPointsLoaded`.

**Traversal is pure and top-down, in a fixed order.** RBush spatial prefilter →
anti-overzoom depth cap (disabled when the node is within 2 km of the camera, two
extra levels beyond the strict formula) → frustum culling (four side planes,
negative-vertex test, run in absolute deck.gl common space against the signed plane
constants, because both are fixed by the `viewProjectionMatrix` the planes come from
and a test in any other space silently keeps or drops everything) → the SSE test
with early termination: a node whose screen error is within the threshold stops its
subtree; a leaf is accepted regardless of SSE; a coarse node yields to its loaded
children. Missing children are recorded as pending hierarchy expansions, capped at 32
per cycle; the orchestrator loads the pages and re-runs the traversal only when
something new actually arrived. The visit loop is an explicit stack in pre-order with
shared mutable contexts, and `shouldCullNode` is a pure predicate over them.

**Geometry is one formula set.** Geometric error per depth is `rootSpacing / 2^depth`;
`rootSpacing` falls back in three tiers — declared spacing → `cbrt(volume /
pointCount)` → diagonal/2 — and converts degrees to meters at the center latitude
(`111320 · cos(lat)`) for WGS84 clouds. Screen-space error is
`geometricError · screenHeight / (2 · distance · tan(fov/2))`, divided by
`pixelRatio`. The projection is a local aeqd rebuilt once per traversal; node bounds
project to meters with Z passed through; distance is Euclidean to the closest point of
the box.

**Priority is a multi-criteria encoding compared as one number.** Three criteria per
candidate — reverse screen error, foveated factor, fractional depth — are normalized
into [0, 1) (a degenerate range yields 0) and packed base-10 into a single priority,
most significant digit group first: foveated dominates reverse screen error, and
depth is the tiebreaker in the fractional part. The upper end is held strictly below
1, including for a value outside the collected bounds, so that no criterion can carry
into its neighbour's digit group. Normalization is single-pass: the bounds accumulate
over visited, non-culled nodes during the same traversal, so early nodes normalize
against a partial range. The encoding ranks the most urgent tile lowest, and both
consumers read it in that direction — the budget planner fills in ascending order,
and the load queue is a min-heap keyed by the rank itself. Skip-LOD (progressive
resolution) is deliberately not implemented — no options are kept for it.

**Budget is counted in points, and eviction is LRU with protections.** `pointBudget`
caps the total points across loaded and loading nodes; the adapter sets the effective
baseline (40 million by default) once at initialization, and that baseline is the
single config path. Planning is one pass over the cache: the occupied budget
accumulates in a running total, sibling blocks reserve atomically through the
traversal's fallbacks map (child key → parent key), and a block that will not fit
whole falls back to accepting the parent plus whatever children the remainder
affords. Either way the running total is charged everything the step accepted, the
fallback parent included: every later candidate is measured against that total, so
a step that under-reports what it took lets the plan over-commit. Members the cycle
has already accepted — loaded or loading — are seated once by the occupancy pass and
skipped by every later step, so a loaded candidate costs the plan nothing. The plan
ends with a deficit against the budget — the occupied overrun alone, since planned
points are part of the total the planner already charged. Eviction then
frees points, and the load list is truncated to the remaining budget: the deficit
minus the freed points. Eviction targets `pointBudget × evictionThresholdRatio`
(0.8) and stops at the frame boundary; LRU order is `lastSeenAt`, protected by: the
visible set, loading and error nodes, nodes in the load plan, parents of loading
children, and a two-frame hysteresis.

**The render path packs visible nodes into one deck.gl layer.** After each cycle's
drain the executor computes the visible set — a pure two-stage filter: the frustum
pass, then the SSE pass. The SSE test here is separate from the traversal's: the
traversal's decides what to load, the render filter's decides what to draw from the
loaded set. The filter skips the descendants of a passing node by walking
`node.parent` (32-step cap) and renders a coarse node without loaded children as-is.
Per-node typed arrays pack into one contiguous buffer (`RenderBufferPool`: grow-only,
`subarray` views, positions as offsets from the coordinate origin). The adapter hands
the packed `PointCloudData` to a single `PointCloudLayer`, updated in place with
versioned update triggers; there are no per-node deck layers. Refresh is cycle-driven:
a scheme switch re-renders without a cycle, raw camera moves do not — the 150 ms
debounce bounds the lag, and the visible-set comparison is element-wise over the
deterministically sorted key list.

**Sources resolve at open time, workers are engine-internal.** A URL source stays a
URL — but each node load wraps it in a bounded getter that rebuilds copc.js's range
wire format on `boundedFetch`, giving the request a 30 s ceiling and a real AbortError
on cancellation; copc.js's own fetch path is never used for point data. File and
ArrayBuffer sources become buffer getters (they read memory, cannot hang, and pass
through untouched), and a File is read into a buffer once. The point worker
always allocates intensity and classification arrays — zeros when the source has no
channel — so packing stays uniform. `WorkerPool` is created inside
`loader.initialize()` with its own sizing heuristic, and every worker request carries
a 20 s ceiling that rejects, terminates and respawns a wedged worker; dispose rejects
everything still pending. LazPerf arrives as a
constructor-injected promise created by the adapter.

**Failures: report once, then the channels take over.** An initialization failure
reports through `reportLayerError` — the engine's only report site. An `addToMap`
failure destroys the unit and rethrows into the layer manager's failed-unit channel
(ADR-0010). A runtime load failure marks the node errored — protected from eviction —
and retries with exponential backoff, keyed by the copc.js cache-operation error
(recognized by its message). The backoff counts a streak of consecutive failures, so
a load that succeeds ends the streak: without that reset a single transient failure
would lengthen every later retry of that tile until it reached the cap, and the tile
would stay sluggish for the rest of the session. Cancellation aborts the in-flight
range request through the load's AbortController — one in-flight load per node key,
so a cancelled-then-reenqueued node never runs two parallel fetches — and the settle
state check stays as the last line of defense for sources the signal cannot reach.

**Picking works through the overlay port.** `picking.ts` extracts a picked point from
the packed buffers — offsets plus coordinate origin, attributes by available channel —
and `OverlayFeatureProvider` implements the shared `FeatureProvider` contract over the
port's `pickObjects`/`pickObject` queries, falling back to the picked GeoJSON object
for non-point layers.

## Consequences

- The engine is invisible to the rest of the kernel: the map sees an adapter and a
  unit, the tree sees a node, tools see features. The whole streaming machinery can
  change without touching `map/`.
- One cycle per camera change bounds work: bursts of viewport events collapse into a
  single traversal, and intermediate requests never queue up.
- Memory is bounded in points, not nodes, and the protection rules keep the set the
  current frame needs from being evicted under it.
- Hidden clouds keep streaming — the engine keeps fetching while the layer is hidden,
  so a re-shown cloud is already current, and the adapter re-creates the deck layer
  from retained data at once on show (ADR-0010).
- Skip-LOD is absent by decision: no half-wired options remain to rot.
