## Purpose

Progressive streaming of COPC point clouds via screen-space error (SSE) LOD, unified priority budget, and device-adaptive quality. Covers octree traversal, node selection, loading/eviction, and runtime quality adjustment.

## Requirements

### Requirement: Geometric error per octree depth

The system SHALL compute a geometric error for each depth level of the COPC octree: `geometricError(D) = rootSpacing / 2^D`.

`rootSpacing` SHALL be derived once at initialization via 3-tier fallback:
1. COPC header `spacing` field
2. Density estimate `cbrt(volume / totalPoints)`
3. Conservative `rootBBoxDiagonal / 2`

#### Scenario: Higher depth yields smaller geometric error

- **GIVEN** `rootSpacing = 100` meters
- **WHEN** `geometricError` is computed for depth 0 and depth 3
- **THEN** `geometricError(0)` SHALL equal 100.0 and `geometricError(3)` SHALL equal 12.5

### Requirement: Screen-space error projection

The system SHALL project geometric error to screen-space error (SSE):

```
screenError = (geometricError × screenHeightPx) / (2 × distanceToCamera × tan(fovRadians / 2))
```

`distanceToCamera` SHALL be Euclidean 3D distance from camera to closest point on node AABB, both reprojected from WGS84 to meters via `proj4` azimuthal equidistant (`+proj=aeqd`) centered on camera position. Projection rebuilt once per traversal. Z passes through unchanged (already in meters).

Camera position SHALL be obtained from deck.gl `Viewport.cameraPosition` via `DeckOverlayManager.getCameraPosition()` — the authoritative view-matrix position used for point cloud rendering.

#### Scenario: SSE grows as camera approaches

- **GIVEN** a node with geometricError = 10m, screenHeight = 1080px, FOV = 60°
- **WHEN** distanceToCamera = 1000m
- **THEN** screenError SHALL be approximately 9.4px
- **AND** at distanceToCamera = 100m, screenError SHALL be approximately 94px

### Requirement: 3D frustum culling

The system SHALL test node visibility using deck.gl's frustum planes via `Viewport.getFrustumPlanes()`.

Node AABB corners SHALL be projected from WGS84 degrees to deck.gl common space using `viewport.projectPosition([lng, lat, alt])`. All 8 corners SHALL be projected because `projectPosition` includes perspective distortion — the axis-aligned property is not preserved under camera pitch.

The AABB SHALL be offset by `viewport.center` for XY alignment and by the camera's common-space Z for vertical alignment with the frustum plane coordinate system.

The AABB-vs-frustum test SHALL test 4 side planes: `left`, `right`, `top`, `bottom`. The `near` plane SHALL remain excluded (camera can be inside the cloud volume). The `far` plane SHALL also be excluded — it governs render distance, not load distance; high-altitude parent nodes must be traversed to reach lower-altitude children.

Deck.gl normals point OUTWARD (`getFrustumPlane` negates the Gribb/Hartmann inward normals). With outward normals, a point is OUTSIDE when `n·p + d > 0`. The test SHALL use `n·p + d > EPS` for culling, with the negative vertex (AABB corner minimizing the dot product).

Deck.gl side-plane distances have inconsistent signs across planes. The system SHALL normalize them: negate any plane where `distance > 0`, making all distances negative at the viewport center so the center passes all planes (or equivalently, negate the test direction for planes with `distance > 0`).

The comparison SHALL use a tolerance of `EPS = 0.1` (approximately 5000m margin at mid-latitudes in common-space units) to prevent edge-of-frustum false culling of tiles near the boundary when the camera is tilted.

The frustum test SHALL execute after the RBush XY prefilter.

#### Scenario: Node inside frustum passes

- **GIVEN** a node whose common-space AABB lies within the camera frustum
- **WHEN** `isAabbInFrustumPlanes(bboxCommon, frustumPlanes)` is called
- **THEN** the function SHALL return `true`

#### Scenario: Node outside left plane is culled

- **GIVEN** a node whose common-space AABB lies entirely to the left of the frustum's `left` plane
- **WHEN** `isAabbInFrustumPlanes(bboxCommon, frustumPlanes)` is called
- **THEN** the function SHALL return `false`

#### Scenario: Node outside right plane is culled

- **GIVEN** a node whose common-space AABB lies entirely to the right of the frustum's `right` plane
- **WHEN** `isAabbInFrustumPlanes(bboxCommon, frustumPlanes)` is called
- **THEN** the function SHALL return `false`

#### Scenario: Node outside top plane is culled

- **GIVEN** a node whose common-space AABB lies entirely above the frustum's `top` plane
- **WHEN** `isAabbInFrustumPlanes(bboxCommon, frustumPlanes)` is called
- **THEN** the function SHALL return `false`

#### Scenario: Node outside bottom plane is culled

- **GIVEN** a node whose common-space AABB lies entirely below the frustum's `bottom` plane
- **WHEN** `isAabbInFrustumPlanes(bboxCommon, frustumPlanes)` is called
- **THEN** the function SHALL return `false`

### Requirement: Top-down octree traversal with early termination

The system SHALL traverse the COPC octree top-down from root. For each node, operations execute in fixed order:

1. RBush XY prefilter — coarse AABB overlap via viewport bounds
2. 3D frustum culling — project AABB to common space via viewport.projectPosition(), offset by viewport.center, test far plane
3. Anti-overzoom guard — per-node depth cap
4. SSE test — `screenError ≤ maxScreenErrorPx` → candidate, stop branch
5. Descend — `screenError > maxScreenErrorPx` → descend to children, keep node as fallback

Leaf nodes (no children in cache) SHALL be accepted regardless of SSE. If children are missing from cache, hierarchy pages are loaded and traversal re-runs. Re-traversal only occurs if new nodes were actually added to cache (prevents infinite recursion on genuine leaves).

Traversal SHALL trigger on camera-idle events (moveend, debounced 150ms), not per frame.

#### Scenario: Sufficiently detailed node stops traversal

- **GIVEN** a node at depth 5 with screenError = 1.5px and maxScreenErrorPx = 2px
- **WHEN** traversal evaluates the node
- **THEN** the node SHALL be marked as a candidate and traversal SHALL NOT descend

#### Scenario: Leaf node always becomes candidate

- **GIVEN** a leaf node with no children in cache, screenError = 100px exceeding threshold
- **WHEN** traversal evaluates the node
- **THEN** the node SHALL be marked as a candidate

### Requirement: Unified priority and greedy budget fill with single-source-of-truth

The system SHALL compute a single priority score: `priority = screenError × √(screenProjectedArea)`.

A single pure function `computeBudgetPlan` SHALL be the sole authority for budget allocation. It SHALL determine `occupied` points as the sum of all nodes with `state === "loaded"` or `state === "loading"`. This SHALL be the only definition of "occupied" in the system. "Occupied" SHALL mean "data is in memory (per-node typed arrays)" — NOT "data is in a GPU buffer."

Budget SHALL be filled by sorting candidates by priority DESC and accepting nodes until `pointBudget` is exceeded. Parent-fallback nodes and their children SHALL be treated as an atomic block for budget reservation.

`computeBudgetPlan` SHALL return a `BudgetPlan` containing:
- `accepted` — node keys that fit within the budget
- `toLoad` — accepted keys that are not yet loaded or loading (need actual fetch)
- `deficit` — additional points needed before `toLoad` can begin (0 if budget not exceeded)

#### Scenario: computeBudgetPlan counts loading nodes as occupied

- **GIVEN** 3 nodes are `"loading"` with 100k points total, and 5 nodes are `"loaded"` with 400k points total
- **WHEN** `computeBudgetPlan` runs with `pointBudget = 500k`
- **THEN** `occupied = 500k` (all space is taken)
- **AND** `deficit > 0` for any new candidates that would add points

#### Scenario: Budget fills by priority

- **GIVEN** pointBudget of 5M and candidates sorted by priority DESC
- **WHEN** greedy fill runs
- **THEN** highest-priority candidates whose cumulative pointCount ≤ 5M SHALL be accepted
- **AND** remaining candidates SHALL be rejected

### Requirement: Parent fallback and eviction hysteresis

A coarse node SHALL remain visible while its child candidates are loading. The parent SHALL be evicted only after at least one child reaches `"loaded"` state.

Evicted nodes SHALL be those resident in memory but NOT in the current cycle's accepted set. A node appearing in the current cycle's traversal candidates SHALL NOT be evicted in the same cycle (hysteresis).

#### Scenario: Parent visible while child loads

- **GIVEN** a parent node with two children, both pending
- **WHEN** traversal selects children as candidates and parent as fallback
- **THEN** the parent SHALL remain rendered until at least one child loads

### Requirement: Concurrency-controlled loading

The system SHALL execute load cycles as a serialized finite state machine. Camera events do not start loading directly — they schedule a cycle request. At most one load cycle SHALL be active at any time.

A load cycle SHALL execute in fixed order: hierarchy expansion → traversal → budget plan → eviction plan → apply eviction → enqueue → await batch.

Each load cycle SHALL await the completion of its enqueued batch before the next cycle begins. If a camera event arrives during an active cycle, the system SHALL schedule one additional cycle to run after the current one completes, collapsing any intermediate events into that single follow-up.

The concurrency limit of `maxConcurrentRequests` (default 4) SHALL apply within each batch — nodes within a batch may load in parallel up to this limit.

In-flight node loads SHALL NOT be aborted when their node leaves the accepted set. They SHALL complete normally — if no longer needed, the next cycle's batch eviction reclaims their space.

#### Scenario: Second camera event during active cycle schedules one retry

- **GIVEN** a load cycle is active (nodes are loading)
- **WHEN** two camera events arrive before the cycle completes
- **THEN** exactly one follow-up cycle SHALL run after the current one, using the latest camera position
- **AND** no further concurrent cycles SHALL start

#### Scenario: Load respects concurrency limit within batch

- **GIVEN** a batch of 20 nodes to load and maxConcurrentRequests = 4
- **WHEN** the cycle starts loading
- **THEN** at most 4 nodes SHALL be "loading" simultaneously at any point

#### Scenario: In-flight load not aborted on camera move

- **GIVEN** node N is in "loading" state and the camera moves
- **WHEN** the next cycle evaluates candidates and excludes node N
- **THEN** node N SHALL complete loading normally
- **AND** node N SHALL be eligible for eviction in the next cycle after it reaches "loaded"

### Requirement: Buffer management and compaction

Node data SHALL be stored in per-node typed arrays on the `CachedNode` object (`positions`, `colorsRgb`, `colorsElevation`, `colorsIntensity`, `colorsClassification`, `intensities`, `classifications`). There SHALL be no single pre-allocated GPU buffer shared across nodes.

Evicted nodes SHALL have their point budget counter (`_totalLoadedPoints`) decremented immediately, and their per-node arrays SHALL be deleted.

Budget eviction SHALL be batch-aware and single-pass: `_applyEviction` SHALL be called once with the total deficit computed by `computeBudgetPlan`, before any `_loadNode` calls in the cycle.

Eviction SHALL select victims by `distanceToCamera` descending (farthest-first), computed fresh from the current camera position. Only `state === "loaded"` nodes SHALL be eligible for eviction. Nodes in `"loading"` state SHALL never be evicted.

If eviction cannot free enough space to accommodate all planned `toLoad` nodes, the system SHALL truncate `toLoad` to fit the actual freed capacity. Truncated nodes SHALL remain in `"pending"` state and SHALL be re-evaluated on the next cycle.

The system SHALL schedule a follow-up cycle when `toLoad` truncation occurs AND eviction freed at least one point (`freedPoints > 0`). If eviction freed zero points, the system SHALL NOT retry.

Per-node eviction from `_loadNode` SHALL NOT occur — batch eviction handles all space reclamation.

`_loadNode` SHALL decrement `_totalLoadedPoints` and delete per-node arrays on abort/error before marking the node for retry.

The `_pendingFreedPoints` counter SHALL NOT exist — eviction SHALL use immediate `_totalLoadedPoints` decrement as the sole budget counter.

The `bufferStartIndex` field SHALL be removed from `CachedNode`. Nodes no longer share a contiguous buffer — per-node arrays are independent.

Buffer compaction (`_compactBuffers`, `copyWithin`) SHALL NOT exist. Per-node arrays are self-contained and need no defragmentation.

Eviction SHALL defer parents whose children are being loaded (in `toLoad` or `state === "loading"`) to prevent visual gaps during zoom transitions.

#### Scenario: Eviction made no progress — no retry

- **GIVEN** no loaded nodes are eligible for eviction (all are closer to camera than any `toLoad` candidate), and `toLoad` exceeds remaining budget
- **WHEN** eviction completes with `freedPoints === 0`
- **THEN** `toLoad` SHALL be truncated to fit the available budget
- **AND** the system SHALL NOT schedule a follow-up cycle

#### Scenario: Batch eviction frees space for all pending loads

- **GIVEN** `toLoad` contains 3 nodes requiring 150k total points, and only 50k free budget remains
- **WHEN** the load cycle processes the batch
- **THEN** `_applyEviction` SHALL be called once before any `_loadNode` calls
- **AND** the farthest `loaded` nodes SHALL be evicted first

#### Scenario: Insufficient eviction space truncates toLoad

- **GIVEN** all loaded nodes are close to the camera, only 30k points can be freed, but `toLoad` requires 100k
- **WHEN** eviction completes
- **THEN** `toLoad` SHALL be truncated to nodes whose cumulative pointCount ≤ 30k
- **AND** the system SHALL schedule a follow-up cycle to retry the remaining nodes

#### Scenario: Loading node never evicted

- **GIVEN** node N is in `"loading"` state
- **WHEN** `_applyEviction` runs
- **THEN** node N SHALL NOT appear in the eviction plan
- **AND** its point count SHALL already be counted as occupied in the budget plan

#### Scenario: Error in loading releases per-node arrays

- **GIVEN** node N is in `"loading"` state
- **WHEN** the load fails with an error
- **THEN** `_totalLoadedPoints` SHALL be decremented by `node.pointCount`
- **AND** `node.positions` and related arrays SHALL be deleted
- **AND** `node.state` SHALL be set to `"error"`

#### Scenario: Parent with loading children survives eviction

- **GIVEN** parent node P is loaded, its children are in `toLoad` or `"loading"` state
- **WHEN** eviction selects P as a victim
- **THEN** P SHALL NOT be evicted (remains visible until children are ready)

### Requirement: Recency-based eviction ordering

The system SHALL track `node.lastSeenAt` — an incrementing traversal-frame counter set on every node appearing in `traversalResult.candidates`, regardless of load state. `node.priority` SHALL also be updated for all candidates in each traversal (not just when queuing for load), keeping eviction decisions aligned with the current camera position.

Eviction victim selection in `_evictForBudget` SHALL sort loaded nodes by:
1. `lastSeenAt` ascending (oldest — evict first)
2. `priority` descending (lower priority — evict first) as tie-break

#### Scenario: Recently seen node survives eviction

- **GIVEN** node A was last seen 5 frames ago (lastSeenAt = 95), node B was last seen 50 frames ago (lastSeenAt = 50)
- **AND** both nodes have equal priority
- **WHEN** eviction needs to free space
- **THEN** node B SHALL be evicted before node A

#### Scenario: Priority updated when camera moves

- **GIVEN** node A was loaded with high priority near old camera position, camera moved away
- **WHEN** a new traversal runs with the node still in candidates
- **THEN** node A's `priority` SHALL be updated to reflect its lower screen contribution at the new position

### Requirement: Device-adaptive quality

The system SHALL determine a device tier (low/mid/high) from `navigator.deviceMemory`, `hardwareConcurrency`, and a GPU tier probe (`MAX_TEXTURE_SIZE` via temporary WebGL canvas). Conservative: lowest tier across signals wins.

Base budget per tier: Low = 2M, Mid = 5M, High = 8M, multiplied by viewport resolution factor (ratio to 1080p, clamped [0.5, 2.0]). Base `maxScreenErrorPx` per tier: Low = 1.0, Mid = 0.67, High = 0.5.

Layer config `maxScreenErrorPx` and `pointBudget` fields SHALL override device defaults when provided.

#### Scenario: Low-memory device gets conservative budget

- **GIVEN** `deviceMemory` = 2 GB, `hardwareConcurrency` = 4, GPU tier = Low
- **WHEN** the system initializes streaming
- **THEN** pointBudget SHALL be 2M × resolutionFactor, maxScreenErrorPx = 1.0

### Requirement: Camera position from deck.gl viewport

Camera position [lng, lat, altitude] SHALL be obtained from deck.gl `Viewport.cameraPosition` + `unproject()` — NOT calculated from MapLibre zoom level. This is the authoritative position used for point cloud rendering.

#### Scenario: deck.gl viewport provides camera position

- **GIVEN** a deck.gl MapboxOverlay is attached to the map
- **WHEN** `DeckOverlayManager.getCameraPosition()` is called
- **THEN** the result SHALL match the view-matrix camera position used for rendering

### Requirement: Per-node typed array storage

When a node reaches `"loaded"` state, the system SHALL store its processed data in per-node typed arrays on the `CachedNode` object:

- `node.positions`: `Float32Array` of length `pointCount × 3`
- `node.colorsRgb`, `node.colorsElevation`, `node.colorsIntensity`, `node.colorsClassification`: `Uint8Array` of length `pointCount × 4` each (RGBA, all four schemes pre-computed by worker)
- `node.intensities`: `Float32Array` of length `pointCount`, or `undefined` if the source has no intensity channel
- `node.classifications`: `Uint8Array` of length `pointCount`, or `undefined` if the source has no classification channel

These arrays SHALL be populated by the main thread from Transferable typed arrays returned by the processing worker. The worker SHALL return arrays whose ownership transfers (no copy) via `postMessage` Transferable list.

#### Scenario: Node loads and stores per-node arrays

- **GIVEN** a node with 100k points transitions from `"loading"` to `"loaded"`
- **WHEN** the worker returns processed data
- **THEN** `node.positions` SHALL be a `Float32Array` of length 300k
- **AND** `node.positions` SHALL contain XYZ offsets in LNGLAT_OFFSETS degree format
- **AND** `node.colorsRgb` SHALL be a `Uint8Array` of length 400k (RGBA)

#### Scenario: Node without intensity channel has undefined intensities

- **GIVEN** a source with no intensity dimension (e.g., RGB-only LAS 1.4 point format 7)
- **WHEN** the node loads
- **THEN** `node.intensities` SHALL be `undefined`

#### Scenario: Worker returns Transferable arrays

- **GIVEN** the processing worker completes decoding a node
- **WHEN** the result is posted to the main thread
- **THEN** the typed arrays SHALL be transferred (not copied), zero-copy from worker to main thread

### Requirement: Render visibility — frustum and SSE filter

The system SHALL provide a pure function `computeVisibleCachedNodes` that filters cached nodes for rendering using a two-stage filter:

1. **Frustum culling**: 8-corner AABB projection to deck.gl common space + `isAabbInFrustumPlanes` (4 side planes only)
2. **SSE LOD**: render the coarsest node passing SSE per subtree; skip descendants of SSE-passing nodes; render nodes without loaded children as fallback

The function SHALL accept: `nodeCache`, `frustumPlanes`, `projectToCommonSpace`, `centerOffset`, `cameraPos`, `geometricErrorByDepth`, `fovRadians`, `screenHeightPx`, `maxScreenErrorPx`.

The function SHALL NOT modify any node state, access the network, or know about `pointBudget`.

Nodes SHALL be sorted by depth ASC for SSE evaluation — numeric depth comparison, not lexicographic string sort — to ensure coarse ancestors are evaluated before deep descendants.

#### Scenario: Parent passes SSE, children skipped

- **GIVEN** parent node with screenError ≤ maxScreenErrorPx and its loaded children in cache
- **WHEN** `computeVisibleCachedNodes` is called
- **THEN** only the parent SHALL be included; children SHALL be skipped

#### Scenario: Parent fails SSE, loaded children render instead

- **GIVEN** parent with screenError > maxScreenErrorPx and loaded children in cache
- **WHEN** `computeVisibleCachedNodes` is called
- **THEN** parent SHALL NOT be included; loaded children SHALL be evaluated

#### Scenario: Parent stays visible while children are loading

- **GIVEN** parent with screenError > maxScreenErrorPx and children in `"loading"` state
- **WHEN** `computeVisibleCachedNodes` is called
- **THEN** parent SHALL be included as fallback (children not ready)

### Requirement: Dynamic render buffer sized to visible set

The system SHALL build a contiguous render buffer from per-node typed arrays of the visible set. The buffer SHALL be sized to exactly the sum of `pointCount` of all visible nodes.

The render buffer SHALL be a grow-only pool: allocated once, grown when the visible set's total points exceed current capacity, never shrunk. Growth SHALL use at minimum a doubling strategy.

Copy order SHALL be deterministic: nodes sorted by key for stable frame-to-frame buffer layout.

#### Scenario: Render buffer grows to fit visible set

- **GIVEN** render capacity is 1M points and the visible set totals 1.5M points
- **WHEN** the render buffer is built
- **THEN** the render buffer SHALL be reallocated to at least 2M points
- **AND** all visible node data SHALL be copied into the buffer

#### Scenario: Render buffer reused when visible set fits

- **GIVEN** render capacity is 2M points and the visible set totals 800k points
- **WHEN** the render buffer is built
- **THEN** no reallocation SHALL occur

### Requirement: Render update triggers on viewport change

The system SHALL invoke the render pipeline on every viewport-change callback from `ViewportManager`, independently of the loading pipeline's debounce.

The render pipeline SHALL skip buffer rebuild when the visible key set is identical to the last render (set-equality via hash).

The render pipeline SHALL also be invoked after each loading cycle's drain completes, to pick up newly loaded nodes.

#### Scenario: Render updates when visible set changes

- **GIVEN** camera pans so a previously visible node exits the frustum and a new node enters
- **WHEN** the viewport-change callback fires
- **THEN** the render pipeline SHALL rebuild the buffer with the new visible set

#### Scenario: Render skipped when visible set unchanged

- **GIVEN** camera pans slightly but the same set of nodes remains visible
- **WHEN** the viewport-change callback fires
- **THEN** no buffer rebuild SHALL occur

### Requirement: Render pipeline independence

The render pipeline SHALL NOT call any loading functions. The loading pipeline SHALL NOT call any render functions.

The render pipeline SHALL read `nodeCache` but SHALL NOT write to it. The only shared state between pipelines is the `nodeCache` map — loading writes, render reads.

#### Scenario: Render pipeline does not trigger network requests

- **GIVEN** the render pipeline runs with a set of visible cached nodes
- **WHEN** monitored for network activity
- **THEN** no fetch requests SHALL be initiated by the render path
