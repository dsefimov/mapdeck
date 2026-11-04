# ADR-0011: Point-cloud streaming — the COPC engine

Status: Accepted · Date: 2026-09-22 · Updated: 2026-11-04 (worker decode, decoded-node
LRU, distance-ranked eviction, two-part frames)

## Context

Point clouds are the only format the app streams. A COPC file can hold billions of
points, and the browser must render exactly the slice the camera justifies: the visible
octree nodes at their screen-space resolution. Fetching everything is impossible, so
the engine keeps a bounded cache, loads nodes on demand, evicts them by use, and draws
a committed base layer plus a small streaming part — never one layer per node. The
engine lives entirely inside the COPC protocol (`domain/protocols/copc/engine/`). The rest of the
core sees none of it: the map sees a render unit that survives visibility toggles and
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

**The engine is a cycle: select, evict, plan, load, render.** A camera change triggers
one cycle. `ViewportManager` listens to the map: `moveend`/`zoomend`/`pitchend`
debounced start a traversal, raw `move` events only store the camera snapshot.
The camera position, the active viewport and the frustum planes are read through
the map context (ADR-0010) and the viewport type flows from the context's
return types; the vertical FOV and the screen height are read directly from the map
and the window; the engine names no deck import. `selectNodesSSE` enters a
single-flight FSM (`CycleRunner`): a request that arrives mid-cycle supersedes it —
the abort signal ends the running cycle's drain wait, and the replacement cycle
prunes the loads it no longer wants. A failed cycle recovers into the next request.
`CycleExecutor` then runs the fixed pipeline: traverse, cancel stale loads, evict,
plan the budget, enqueue the load batch, await the drain, commit the render into
a fresh base, notify through `onPointsLoaded`.

**Traversal is pure and top-down, in a fixed order.** RBush spatial prefilter →
anti-overzoom depth cap (relaxed near the camera) → frustum culling (four side
planes, negative-vertex test, in absolute common space — the only space where the
test is exact) → the SSE test
with early termination: a node whose screen error is within the threshold stops its
subtree; a leaf is accepted regardless of SSE; a coarse node yields to its loaded
children. Missing children are recorded as pending hierarchy expansions, capped per
cycle; the orchestrator loads the pages and re-runs the
traversal only when something new actually arrived. The hierarchy loads lazily, one
page per request — the first points render after the root page, not a full-tree walk.

**Geometry lives in `engine/geometry/`.** The formulas — ground resolution, camera
projection, screen-space error, the meters-per-degree conversion — are defined there
and pinned by colocated tests. The decisions the code cannot state: distances are
meters throughout (degree-valued spacing converts at the extent's center latitude);
the FOV is the map's vertical field of view; screen-space error is divided by the
device pixel ratio. The projection is a local aeqd rebuilt once per traversal; node bounds
project to meters with Z passed through; distance is Euclidean to the closest point of
the box.

**Priority is one comparable number.** Three criteria per candidate — reverse screen
error, foveated factor, fractional depth — are normalized and packed into a single
priority with a fixed criterion order (foveated dominates, depth breaks ties); the
packing is order-only, so no criterion can carry into its neighbour's range.

**Budget is counted in points, and eviction serves the current view.** `pointBudget`
caps the total points across loaded and loading nodes; the adapter sets the baseline
once at initialization — the single config path. Planning is one pass over the
cache: the occupied budget accumulates in a running total, sibling blocks reserve
atomically, and a block that will not fit whole falls back to accepting the parent
plus whatever children the remainder affords — every step is charged everything it
accepted, so a step that under-reports lets the plan over-commit; the plan itself
never accepts past the budget. Eviction runs before planning; its target is
`max(0, budget − demand)`, where demand is the points the current candidates have
not yet served. Victims are ranked farthest from the viewport rectangle first,
stalest traversal stamp breaking ties; this cycle's candidates are untouchable,
and a loaded parent whose region is still loading stays as the fallback renderer
(`engine/eviction/`). Evicted nodes move to a byte-budgeted decoded LRU
(`DecodedNodeCache`, `decodedCacheBytes`, default 256 MiB); a reload restores the
payload without refetch or decode.

**The render path is a two-part frame: a committed base plus a streaming part.**
After each cycle's drain the executor computes the visible set — a pure two-stage
filter: the frustum pass, then the SSE pass. The SSE test here is separate from the
traversal's: the traversal's decides what to load, the render filter's decides what
to draw from the loaded set. Per-node typed arrays pack into two contiguous buffer
pairs (`RenderBufferPool`: grow with doubling, shrink with hysteresis, `subarray`
views, positions as offsets from the coordinate origin). The base envelope keeps
its object reference between pushes — a renderer holding it skips the re-upload;
nodes streamed since the last commit pack into a small incoming part. A commit
folds the incoming part into a fresh base, automatically at a quarter of the base.
The adapter runs two deck layers, the bare id and `<id>-incoming`; picking
normalizes back to the tree layer id (`stripPointCloudLayerSuffix` in contracts).
Frame envelopes are views into pool-owned memory, valid until the next push (the
contract on `PointCloudFrame`). There are no per-node deck layers. Refresh is
cycle-driven: a scheme switch re-renders without a cycle, raw camera moves do not —
the viewport debounce bounds the lag.

**Sources resolve at open time, workers are engine-internal.** A URL source stays a
URL — but every read goes through bounded getters that rebuild copc.js's range wire
format, giving each request a ceiling and a real AbortError on cancellation: node
loads through a per-load getter, the header and hierarchy pages through a shared
one; copc.js's own fetch path is never used. Range requests are sent `no-store`:
ranges are unique bytes, and Chrome's disk cache intermittently fails ranged
responses. The main thread only fetches a node's compressed bytes — laz-perf
decompression, raw extraction, reprojection and color derivation run in the worker
pool's process job. The wasm URL is absolutized against the page (inline-blob
workers cannot resolve relative URLs); the pool queue is priority-ordered
(interactive recolors ahead of bulk). File and ArrayBuffer sources become buffer
getters; a File is read into a buffer once. The point worker always allocates
intensity and classification arrays — zeros when the source has no channel — so
packing stays uniform. `WorkerPool` is created inside `loader.initialize()`, and
every worker request carries a ceiling that rejects, terminates and respawns a
wedged worker; dispose rejects everything still pending.

**Failures: report once, then the channels take over.** An initialization failure
reports through `reportLayerError` — the engine's only report site. An `addToMap`
failure destroys the unit and rethrows into the layer manager's failed-unit channel
(ADR-0010). A runtime load failure marks the node errored — protected from eviction —
and retries with exponential backoff that resets on success, so a single transient
failure does not lengthen later retries. Cancellation aborts the in-flight range
request; one in-flight load per node key, so a re-enqueued node never runs two
parallel fetches.

**Picking works through the overlay port.** `picking.ts` extracts a picked point from
the packed buffers — offsets plus coordinate origin, attributes by available channel —
and `OverlayFeatureProvider` implements the shared `FeatureProvider` contract over the
port's `pickObjects`/`pickObject` queries, falling back to the picked GeoJSON object
for non-point layers.

## Consequences

- The engine is invisible to the rest of the core: the map sees an adapter and a
  unit, the tree sees a node, tools see features. The whole streaming implementation can
  change without touching `map/`.
- One cycle per camera change bounds work: bursts of viewport events collapse into a
  single traversal, and intermediate requests never queue up.
- Memory is bounded in points, not nodes, and the protection rules keep the set the
  current frame needs from being evicted under it; evicted bytes rest in the
  decoded-node LRU up to its own byte budget — a revisit restores without a refetch.
- Hidden clouds keep streaming — the engine keeps fetching while the layer is hidden,
  so a re-shown cloud is already current, and the adapter re-creates the deck layers
  from retained data at once on show (ADR-0010).
