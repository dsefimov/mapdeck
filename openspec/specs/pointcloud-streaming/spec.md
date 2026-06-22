## Purpose

Progressive streaming of COPC point clouds — from source to screen — via screen-space error (SSE) LOD, unified priority budget, and zero-copy render assembly.

### Data Flow

```
                                    ┌─────────────┐
                                    │   Source    │ (URL, File, ArrayBuffer)
                                    └──────┬──────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │ 1. Initialize                   │
                          │   openCopcSource / resolveUrl   │
                          │   Copc.create()                 │
                          │   extractCopcMeta               │
                          │   buildCrsTransformer           │
                          │   computeWgs84Bounds            │
                          │   computeCoordinateOrigin       │
                          │   computeSpacingMeters          │
                          │   initCopc() orchestrator       │
                          └────────────────┬────────────────┘
                                           │ CopcInitResult
                                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Viewport    │────▶│ 2. Traverse │────▶│ 3. Budget   │
│ Manager     │     │  Octree     │     │  Plan       │
│ (debounced) │     │  + frustum  │     │  + evict    │
│             │     │  + SSE LOD  │     │             │
│ buildCamera │     │  + priority │     │ compute     │
│ Snapshot    │     │  per node   │     │ BudgetPlan  │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │
                           │ candidates        │ accepted / toLoad
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ 4. Load     │◀────│ 5. Evict    │
                    │             │     │ (LRU + trim)│
                    │ enqueue     │     │             │
                    │ fetch/decode│     │ TileCache   │
                    │ worker      │     │ Replacement │
                    │ store arr.  │     │ Queue       │
                    └──────┬──────┘     └─────────────┘
                           │ per-node typed arrays
                           ▼
                    ┌─────────────┐
                    │ 6. Render   │
                    │             │
                    │ frustum +   │
                    │ SSE filter  │
                    │ ancestor    │
                    │ fallback    │
                    │             │
                    │ Render      │
                    │ BufferPool  │
                    │ .build()    │
                    │             │
                    │ create      │
                    │ PointCloud  │
                    │ Layer()     │
                    └──────┬──────┘
                           │ PointCloudData
                           ▼
                    ┌─────────────┐
                    │ deck.gl     │
                    │ renders     │
                    └─────────────┘
```

---

## 1. Initialization

### Requirement: Source resolution

The system SHALL provide `resolveUrl(url)` to convert a relative URL to absolute using `window.location.origin`. If the URL is already absolute or `window` is unavailable, the URL SHALL be returned unchanged.

#### Scenario: Relative URL resolved

- **GIVEN** `window.location.origin = "https://example.com"`
- **WHEN** `resolveUrl("/data/cloud.copc.laz")` is called
- **THEN** the result SHALL be `"https://example.com/data/cloud.copc.laz"`

#### Scenario: Absolute URL passed through

- **WHEN** `resolveUrl("https://cdn.example.com/cloud.copc.laz")` is called
- **THEN** the result SHALL be `"https://cdn.example.com/cloud.copc.laz"`

### Requirement: Buffer getter from ArrayBuffer

The system SHALL provide `createBufferGetter(buffer)` that returns a `Getter` function `(begin, end) => Uint8Array` for use with copc.js.

#### Scenario: Getter returns correct slice

- **GIVEN** `buffer = new ArrayBuffer(100)` with bytes 0-99 set to their index
- **WHEN** `createBufferGetter(buffer)(10, 20)` is called
- **THEN** the result SHALL be a `Uint8Array` of length 10 containing bytes 10-19

### Requirement: COPC source opening

The system SHALL provide `openCopcSource(source)` that normalizes the input (URL string, File, or ArrayBuffer), calls `Copc.create()`, and throws descriptive errors with context (CORS, invalid file) on failure.

#### Scenario: URL source opened

- **WHEN** `openCopcSource("https://example.com/cloud.copc.laz")` is called
- **THEN** the result SHALL contain `copc` (CopcType) and `resolvedSource` (URL string)

#### Scenario: File source opened

- **GIVEN** `file = new File([...], "cloud.copc.laz")`
- **WHEN** `openCopcSource(file)` is called
- **THEN** the result SHALL contain `copc` (CopcType) and `resolvedSource` (the File object)

#### Scenario: ArrayBuffer source opened

- **GIVEN** `buffer = new ArrayBuffer(...)` containing valid COPC data
- **WHEN** `openCopcSource(buffer)` is called
- **THEN** the result SHALL contain `copc` (CopcType) and `resolvedSource` (the Getter function)

### Requirement: COPC metadata extraction

The system SHALL provide `extractCopcMeta(copc)` — a pure function that reads `rootHierarchyPage`, `spacing`, `totalPoints`, `octreeCube`, and `hasColor` from a `CopcType` instance without mutation.

#### Scenario: Metadata extracted

- **GIVEN** a CopcType with spacing=0.5, totalPoints=10_000_000, pointFormat with RGB channels
- **WHEN** `extractCopcMeta(copc)` is called
- **THEN** `hasColor` SHALL be `true` and `spacing` SHALL be `0.5`

### Requirement: CRS transformer from WKT

The system SHALL provide `buildCrsTransformer(wkt)` that returns a proj4 coordinate transformer function `(lng, lat) => [lng, lat]`. If WKT is absent or unsupported by proj4, the function SHALL throw.

#### Scenario: Valid WKT produces transformer

- **GIVEN** a WKT string for EPSG:32633 (UTM zone 33N)
- **WHEN** `buildCrsTransformer(wkt)` is called
- **THEN** the result SHALL be a function that transforms coordinates from that CRS to WGS84

### Requirement: WGS84 bounds computation

The system SHALL provide `computeWgs84Bounds(header, transformer)` that computes geographic bounds from COPC header. When `transformer` is provided, corner coordinates SHALL be transformed from source CRS to WGS84.

#### Scenario: WGS84 source — bounds from header directly

- **GIVEN** a COPC header with min=[10, 50, 100], max=[11, 51, 200], and `transformer = null`
- **WHEN** `computeWgs84Bounds(header, null)` is called
- **THEN** the result SHALL be `{ minX: 10, minY: 50, minZ: 100, maxX: 11, maxY: 51, maxZ: 200 }`

### Requirement: Coordinate origin

The system SHALL provide `computeCoordinateOrigin(bounds)` that returns the bounding box center `[(minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2]`.

#### Scenario: Origin computed

- **GIVEN** `bounds = { minX: 0, minY: 0, minZ: 10, maxX: 100, maxY: 50, maxZ: 30 }`
- **WHEN** `computeCoordinateOrigin(bounds)` is called
- **THEN** the result SHALL be `[50, 25, 20]`

### Requirement: Spacing in meters

The system SHALL provide `computeSpacingMeters(spacingDegrees, bounds, needsTransform)` that returns spacing in meters. When `needsTransform` is `false` (WGS84 data), degrees SHALL be converted to meters using `metersPerDegree` constant; otherwise spacing is already in source CRS meters.

#### Scenario: WGS84 spacing converted to meters

- **GIVEN** `spacingDegrees = 0.01`, `needsTransform = false`
- **WHEN** `computeSpacingMeters(...)` is called
- **THEN** the result SHALL be approximately `0.01 × 111_320 ≈ 1113.2` meters

#### Scenario: Projected CRS spacing unchanged

- **GIVEN** `spacingDegrees = 10`, `needsTransform = true`
- **WHEN** `computeSpacingMeters(...)` is called
- **THEN** the result SHALL be `10` meters

### Requirement: Pure-function initialization pipeline

The system SHALL provide `initCopc(source, lazPerf)` — an orchestrator that wires all initialization sub-functions and returns `CopcInitResult` containing `copc`, `resolvedSource`, `meta` (bounds, origin, totalPoints, spacing, spacingMeters, hasColor, wkt, octreeCube), `transformer`, and `needsTransform`.

#### Scenario: Full initialization from URL

- **WHEN** `initCopc(url, lazPerf)` is called with a valid COPC URL
- **THEN** the result SHALL contain all fields required for streaming

### Requirement: LazPerf is an injected dependency

The `CopcStreamingLoader` constructor SHALL accept `lazPerfPromise: Promise<LazPerf>`. The loader SHALL await it in `initialize()` and assign the resolved instance to `this._lazPerf`. The caller (adapter) SHALL create the promise via `createLazPerf(...)` and pass it in. The module-level `getLazPerf()` singleton SHALL NOT exist.

#### Scenario: LazPerf resolved during initialization

- **GIVEN** a caller creates a `LazPerf` promise via `createLazPerf({ locateFile: ... })`
- **WHEN** `new CopcStreamingLoader(source, options, lazPerfPromise)` is called and `initialize()` runs
- **THEN** the loader SHALL await the promise and use the resolved `LazPerf` for all point-cloud decoding

---

## 2. Viewport

### Requirement: CameraSnapshot as explicit interface

`CameraSnapshot` SHALL carry all camera state for module boundaries (ViewportManager → CopcStreamingLoader → traverseOctree → render filters):

- `cameraPos: [number, number, number]` — lng, lat, alt-meters
- `cameraDirection: [number, number, number]` — normalized direction vector
- `fovRadians: number`
- `screenHeightPx: number`
- `pixelRatio: number`
- `frustumPlanes: FrustumPlanes`
- `projectToCommonSpace: (lng, lat, alt) => [number, number, number]`
- `centerOffset: [number, number]`
- `camCommonZ: number` — precomputed `projectToCommonSpace(cameraPos)[2]` for frustum alignment

All fields SHALL be eagerly populated; the snapshot SHALL NOT reference live objects that may mutate.

#### Scenario: CameraSnapshot carries all camera state

- **WHEN** `buildCameraSnapshot(providers)` is called with valid provider values
- **THEN** the returned snapshot SHALL have all 9 fields populated with non-null values

#### Scenario: camCommonZ is precomputed

- **GIVEN** a CameraSnapshot built from valid providers
- **WHEN** `camCommonZ` is accessed
- **THEN** the value SHALL equal `projectToCommonSpace(cameraPos[0], cameraPos[1], cameraPos[2])[2]`

### Requirement: buildCameraSnapshot — pure function

`buildCameraSnapshot(providers: CameraProviders)` SHALL construct a `CameraSnapshot` from resolved provider values. All `null` checks SHALL happen before calling this function; the function itself SHALL have no branches.

#### Scenario: Valid providers produce snapshot

- **GIVEN** `CameraProviders` with valid `cameraPos`, `frustumPlanes`, `viewport`, `fovDegrees = 60`, `screenHeightPx = 1080`
- **WHEN** `buildCameraSnapshot(providers)` is called
- **THEN** result SHALL contain `fovRadians = π/3`, `screenHeightPx = 1080`, `cameraDirection`, and the given `frustumPlanes`

### Requirement: Camera direction in snapshot

`CameraSnapshot` SHALL include `cameraDirection: [number, number, number]` — the normalized camera look direction derived from deck.gl viewport pitch and bearing. Defaults to `[0, 0, -1]` when pitch/bearing are unavailable.

#### Scenario: Top-down view has downward direction

- **GIVEN** the camera is looking straight down (nadir, pitch = 0)
- **WHEN** `buildCameraSnapshot` is called
- **THEN** `cameraDirection` SHALL be approximately `[0, 0, -1]`

#### Scenario: Missing pitch/bearing defaults to downward

- **GIVEN** the deck.gl viewport does not provide pitch/bearing
- **WHEN** `buildCameraSnapshot` is called
- **THEN** `cameraDirection` SHALL default to `[0, 0, -1]`

### Requirement: Camera position from deck.gl viewport

Camera position [lng, lat, altitude] SHALL be obtained from deck.gl `Viewport.cameraPosition` + `unproject()` — NOT calculated from MapLibre zoom level.

#### Scenario: deck.gl viewport provides camera position

- **GIVEN** a deck.gl MapboxOverlay is attached to the map
- **WHEN** `DeckOverlayManager.getCameraPosition()` is called
- **THEN** the result SHALL match the view-matrix camera position used for rendering

### Requirement: ViewportManager uses shared debounce

`ViewportManager` SHALL import `debounce` from `@core/shared/async/debounce` rather than defining it inline.

#### Scenario: Rapid calls produce one invocation

- **GIVEN** `debounced = debounce(fn, 100)` where `fn` records call count
- **WHEN** `debounced()` is called 10 times within 50ms
- **THEN** after 150ms, `fn` SHALL have been called exactly once

---

## 3. Traversal

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

### Requirement: Root spacing in meters for WGS84 files

When `_needsTransform === false` (data is in WGS84), `rootSpacing` SHALL be converted from degrees to meters by multiplying by `metersPerDegree` before being used for geometric error computation.

#### Scenario: WGS84 root spacing converted to meters

- **GIVEN** a WGS84 file with `rootSpacing = 0.01` degrees, `metersPerDegree = 111_320`
- **WHEN** initialization completes
- **THEN** `geometricErrorByDepth(0)` SHALL be approximately `1113.2` meters, not `0.01`

### Requirement: Screen-space error projection

The system SHALL project geometric error to screen-space error (SSE):

```
screenError = (geometricError × screenHeightPx) / (2 × distanceToCamera × tan(fovRadians / 2))
```

`distanceToCamera` SHALL be Euclidean 3D distance from camera to closest point on node AABB, both reprojected from WGS84 to meters via `proj4` azimuthal equidistant (`+proj=aeqd`) centered on camera position. Projection rebuilt once per traversal. Z passes through unchanged (already in meters).

#### Scenario: SSE grows as camera approaches

- **GIVEN** a node with geometricError = 10m, screenHeight = 1080px, FOV = 60°
- **WHEN** distanceToCamera = 1000m
- **THEN** screenError SHALL be approximately 9.4px
- **AND** at distanceToCamera = 100m, screenError SHALL be approximately 94px

### Requirement: getScreenSpaceError with pixelRatio support

The traversal and render pipelines SHALL call `getScreenSpaceError(geometricError, distanceToCamera, camera)` where `camera` includes `pixelRatio`. The deprecated 4-arg `computeScreenError` SHALL be removed.

#### Scenario: HiDPI display halves effective SSE

- **GIVEN** `pixelRatio = 2.0`, geometric error = 10m, distance = 1000m, FOV = 60°, screen height = 1080px
- **WHEN** `getScreenSpaceError(...)` is called
- **THEN** screen error SHALL be approximately `9.4 / 2 = 4.7px` (halved by pixel ratio)

### Requirement: 3D frustum culling

The system SHALL test node visibility using deck.gl's frustum planes via `Viewport.getFrustumPlanes()`.

Node AABB corners SHALL be projected from WGS84 degrees to deck.gl common space using `viewport.projectPosition([lng, lat, alt])`. All 8 corners SHALL be projected because `projectPosition` includes perspective distortion.

The AABB SHALL be offset by `viewport.center` for XY alignment and by the camera's common-space Z for vertical alignment.

The AABB-vs-frustum test SHALL test 4 side planes: `left`, `right`, `top`, `bottom`. The `near` plane SHALL remain excluded (camera can be inside the cloud volume). The `far` plane SHALL also be excluded — high-altitude parent nodes must be traversed to reach lower-altitude children.

Deck.gl normals point OUTWARD. With outward normals, a point is OUTSIDE when `n·p + d > 0`. The test SHALL use `n·p + d > EPS` for culling, with the negative vertex (AABB corner minimizing the dot product).

Deck.gl side-plane distances have inconsistent signs. The system SHALL normalize them: negate any plane where `distance > 0`.

Comparison SHALL use `EPS = 0.1` to prevent edge-of-frustum false culling.

The frustum test SHALL execute after the RBush XY prefilter.

#### Scenario: Node inside frustum passes

- **GIVEN** a node whose common-space AABB lies within the camera frustum
- **WHEN** `isAabbInFrustumPlanes(bboxCommon, frustumPlanes)` is called
- **THEN** the function SHALL return `true`

#### Scenario: Node outside left plane is culled

- **GIVEN** a node whose common-space AABB lies entirely to the left of the frustum's `left` plane
- **WHEN** `isAabbInFrustumPlanes(bboxCommon, frustumPlanes)` is called
- **THEN** the function SHALL return `false`

### Requirement: Top-down octree traversal with early termination

The system SHALL traverse the COPC octree top-down from root. For each node, operations execute in fixed order:

1. RBush XY prefilter — coarse AABB overlap via viewport bounds
2. 3D frustum culling
3. Anti-overzoom guard — per-node depth cap
4. SSE test — `screenError ≤ maxScreenErrorPx` → candidate, stop branch
5. Descend — `screenError > maxScreenErrorPx` → descend to children, keep node as fallback

Leaf nodes (no children in cache) SHALL be accepted regardless of SSE. If children are missing from cache, hierarchy pages are loaded and traversal re-runs. Re-traversal only occurs if new nodes were actually added to cache.

Traversal SHALL trigger on camera-idle events (moveend, debounced 150ms), not per frame.

#### Scenario: Sufficiently detailed node stops traversal

- **GIVEN** a node at depth 5 with screenError = 1.5px and maxScreenErrorPx = 2px
- **WHEN** traversal evaluates the node
- **THEN** the node SHALL be marked as a candidate and traversal SHALL NOT descend

#### Scenario: Leaf node always becomes candidate

- **GIVEN** a leaf node with no children in cache, screenError = 100px exceeding threshold
- **WHEN** traversal evaluates the node
- **THEN** the node SHALL be marked as a candidate

### Requirement: shouldCullNode — pure function

`shouldCullNode(key, node, rbushKeySet, camera, camCommonZ, projector, depthCap, depth)` SHALL return `true` if the node should be skipped during octree traversal (RBush XY prefilter, frustum, or depth cap). Returns `false` if the node passes all culling checks.

### Requirement: Foveated factor computation

The system SHALL compute a per-node foveated factor during traversal as the angular deviation between the camera look direction and the tile center direction:

1. Compute the tile center in aeqd-projected meter space from `node.boundsWgs84`
2. Compute the vector from camera position to tile center: `toTile = normalize(tileCenter - cameraPos)`
3. Compute foveated factor: `1 - max(EPSILON7, dot(cameraDirection, toTile))`

#### Scenario: Center tile has near-zero foveated factor

- **GIVEN** a tile whose center is exactly aligned with the camera look direction
- **WHEN** foveated factor is computed
- **THEN** the factor SHALL be approximately 0.0

#### Scenario: Edge tile has high foveated factor

- **GIVEN** a tile whose center is 60° off the camera look direction
- **WHEN** foveated factor is computed
- **THEN** the factor SHALL be approximately 0.5 (cos(60°) = 0.5, factor = 1 - 0.5 = 0.5)

### Requirement: Multi-criteria priority encoding

The system SHALL compute a single priority score using a base-10 multi-criteria encoding via `updatePriority(node, bounds, priorityStateMap, options)`. The priority encodes four continuous criteria normalized against the full visible candidate set, plus a progressive-resolution leaf flag:

| Position | Criterion | Encoding |
|----------|-----------|----------|
| 4 | Progressive-resolution leaf (0 = leaf, 1 = non-leaf) | ×10⁸ |
| 1 | Foveated factor (center=0, edge=1) | ×10⁴ |
| 0 | Preferred sort: reverse-SSE (base traversal) or distance (skip traversal) | ×10⁰ |
| fractional | Depth | least significant digits |

Continuous criteria (distance, foveated factor, reverse-SSE, depth) SHALL be normalized to [0, 1] using min-max bounds collected from all visited nodes during the current traversal. Each normalized value SHALL have EPSILON7 subtracted to prevent exactly 0 or 1 (except when min === max, where 0.0 is returned).

Each candidate node SHALL have a `PriorityState` entry in the WeakMap populated during traversal.

#### Scenario: Center-screen tiles get higher foveated priority

- **GIVEN** two nodes A and B at equal distance from camera, equal screenError
- **AND** node A is at camera center (angle 0° from look direction), node B is at screen edge (angle 30°)
- **WHEN** `updatePriority` computes priority for both
- **THEN** node A SHALL have a higher priority than node B

#### Scenario: Priority bounds exclude culled nodes

- **GIVEN** 10 nodes in cache, 3 pass RBush+frustum+anti-overzoom, 7 are culled
- **WHEN** `PriorityBounds` are collected during traversal
- **THEN** only the 3 visible nodes SHALL contribute to min/max bounds

### Requirement: computeNodeMetrics — pure function

`computeNodeMetrics(node, depth, ...)` SHALL compute per-node traversal metrics using `updatePriority` for the base-10 priority score, `getScreenSpaceError` for screen-space error, and `computeFoveatedFactor` for foveated factor. Returns `{ screenError, priority, distanceToCamera }`.

### Requirement: CachedNode core type — no internal auxiliary fields

The public `CachedNode` type (in `@core/framework/types`) SHALL contain only fields that constitute the stable public contract. Internal auxiliary fields SHALL be stored in subsystem-scoped `WeakMap<CachedNode, T>` records within the files that use them.

Fields removed from `CachedNode`:
- `_loadedAtFrame`, `_loadController` → `NodeLoadMeta` WeakMap in `CopcStreamingLoader`
- `_priorityHolder`, `_distanceToCamera`, `_foveatedFactor`, `_depth`, `_priorityReverseScreenSpaceError` → `PriorityState` WeakMap in `priority/updatePriority.ts`
- `_ancestorWithContent`, `_ancestorWithContentAvailable`, `_requestedFrame` → `AncestorLinks` WeakMap in `traversal/lodSeparation.ts`

#### Scenario: PriorityState stored per-node via WeakMap

- **GIVEN** a `CachedNode` with `key = "3-1-2-0"` and `PriorityState.priorityHolder` referencing a different node
- **WHEN** `priorityState.get(node)` is called
- **THEN** the `PriorityState` record SHALL be returned; `node` itself SHALL have no `_priorityHolder` property

#### Scenario: NodeLoadMeta stored per-node via WeakMap

- **GIVEN** a `CachedNode` in `"loading"` state
- **WHEN** `this.loadMeta.get(node)` is called from `CopcStreamingLoader`
- **THEN** `NodeLoadMeta.loadedAtFrame` and `loadController` SHALL be available; `node` itself SHALL have no `_loadedAtFrame` or `_loadController` properties

---

## 4. Budget

### Requirement: computeOccupiedBudget — pure function

`computeOccupiedBudget(nodeCache)` SHALL return:
- `occupied`: sum of `pointCount` for all nodes where `state === "loaded"` or `state === "loading"`
- `acceptedKeys`: `Set<string>` of those nodes' keys

It SHALL NOT mutate any node or external state.

#### Scenario: Counts loaded and loading nodes

- **GIVEN** 3 loaded nodes (100k, 200k, 300k points) and 1 loading node (50k points)
- **WHEN** `computeOccupiedBudget(nodeCache)` is called
- **THEN** `occupied = 650k` and `acceptedKeys.size = 4`

### Requirement: Unified priority and greedy budget fill with single-source-of-truth

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

#### Scenario: Budget fills by multi-criteria priority

- **GIVEN** pointBudget of 5M and candidates sorted by base-10 priority DESC
- **WHEN** greedy fill runs
- **THEN** highest-priority candidates whose cumulative pointCount ≤ 5M SHALL be accepted
- **AND** remaining candidates SHALL be rejected

### Requirement: buildParentChildMap — pure function

`buildParentChildMap(fallbacks)` SHALL invert a `Map<childKey, parentKey>` into `Map<parentKey, Set<childKey>>`.

#### Scenario: Multiple children under one parent

- **GIVEN** `fallbacks = { "1-0-0-0": "0-0-0-0", "1-0-0-1": "0-0-0-0" }`
- **WHEN** `buildParentChildMap(fallbacks)` is called
- **THEN** result SHALL be `Map { "0-0-0-0" → Set { "1-0-0-0", "1-0-0-1" } }`

### Requirement: reserveSiblingBlock — atomic parent+siblings reservation

`reserveSiblingBlock(parentKey, parentNode, siblingKeys, blockCandidates, runningPointCount, pointBudget, nodeCache, accepted)` SHALL reserve an atomic block (parent + all siblings) if total points fit within budget. Returns `{ keysToAccept, pointsConsumed }` on success, `null` if the block doesn't fit.

#### Scenario: Block fits within budget

- **GIVEN** parent (100k pts), 2 siblings (50k each), runningPointCount = 200k, pointBudget = 500k
- **WHEN** `reserveSiblingBlock(...)` is called
- **THEN** result SHALL be `{ keysToAccept: [parent, sib1, sib2], pointsConsumed: 200k }`

#### Scenario: Block exceeds budget

- **GIVEN** parent (100k pts), 3 siblings (200k each), runningPointCount = 400k, pointBudget = 500k
- **WHEN** `reserveSiblingBlock(...)` is called
- **THEN** result SHALL be `null` (total 700k > 500k)`

### Requirement: Budget plan and toLoad truncation

After eviction, if `effectiveDeficit = plan.deficit - freedPoints > 0`, the system SHALL truncate `toLoad` to fit the remaining budget. Truncated nodes remain `"pending"` and are re-evaluated next cycle.

The system SHALL schedule a follow-up cycle when truncation occurs AND eviction freed at least one point (`freedPoints > 0`).

#### Scenario: Truncation when eviction insufficient

- **GIVEN** deficit = 100k, eviction freed only 30k points
- **WHEN** effectiveDeficit = 70k > 0
- **THEN** `toLoad` SHALL be truncated to fit 30k remaining budget
- **AND** a follow-up cycle SHALL be scheduled

## 5. Eviction

### Requirement: LRU eviction via TileEvictionManager

The system SHALL maintain a `TileEvictionManager<CachedNode>` — a single doubly-linked list with `O(1)` touch, mark-rendered, and evict-from-tail operations via an internal `Map<CachedNode, EvictionNode>` index. This unified structure replaces the separate `TileCache` (LRU list) and `TileReplacementQueue` (render-frame trim list).

The list SHALL support three operations:
- **touch(tile)**: Move tile to head. If not yet in the list, insert at head.
- **markStartOfRenderFrame()**: Record the current head as the frame boundary.
- **markTileRendered(tile)**: Move tile to head (equivalent to touch).

Eviction SHALL run via `evictToBudget(ctx)` with this interface:

```
interface EvictionContext<T> {
    totalPoints: number;
    targetBudget: number;         // pointBudget × evictionThresholdRatio
    currentFrame: number;
    nodeCache: ReadonlyMap<string, T>;
    toLoadSet: ReadonlySet<string>;
    errorKeys: Set<string>;
}
```

The eviction loop iterates from tail toward head, calling `clearTileData(tile, errorKeys)` for each eligible tile until `totalPoints <= targetBudget`. Tiles are protected if:
1. They are past the frame boundary (rendered in current frame)
2. `lastSeenAt >= currentFrame - 1` (2-frame hysteresis)
3. Any child is `"loading"`, `"error"`, or in `toLoadSet` (parent protection)

Returns `{ freedPoints, evictedCount }`. Per-node cleanup SHALL use `clearTileData(node, errorKeys)` from `eviction/clearTileData.ts`.

#### Scenario: Protected tile survives eviction

- **GIVEN** tile A was marked rendered during current frame (past frame boundary), tile B was not
- **AND** `totalPoints > targetBudget`
- **WHEN** `evictToBudget(ctx)` runs
- **THEN** tile B SHALL be evicted; tile A SHALL survive

#### Scenario: Eviction stops at target budget

- **GIVEN** `totalPoints = 35M`, `targetBudget = 32M`, tail tiles have 5M points each
- **WHEN** `evictToBudget(ctx)` runs
- **THEN** first tile (5M) SHALL be evicted (35M → 30M < 32M)
- **AND** eviction SHALL stop; total freed = 5M

#### Scenario: Parent with loading children survives eviction

- **GIVEN** parent node's children are in `"loading"` state or in `toLoadSet`
- **WHEN** eviction loop evaluates the parent
- **THEN** the parent SHALL be skipped

#### Scenario: Recently-visible node survives eviction (2-frame hysteresis)

- **GIVEN** node N has `lastSeenAt >= currentFrame - 1` (was candidate last 2 cycles)
- **AND** N is NOT in current frame boundary
- **WHEN** eviction evaluates N
- **THEN** N SHALL be skipped

### Requirement: Count-based tile trimming via TileReplacementQueue

**Removed**. Replaced by unified `TileEvictionManager.evictToBudget()` which handles both point-budget pressure and tile count trimming in a single pass. The `maximumTiles` option maps to `targetBudget` in the eviction context.

---

## 6. Loading

### Requirement: Concurrency-controlled loading

The system SHALL execute load cycles as a serialized finite state machine. Camera events do not start loading directly — they schedule a cycle request. At most one load cycle SHALL be active at any time.

A load cycle SHALL execute in fixed order: hierarchy expansion → traversal → `_cancelStaleRequests` (abort stale in-flight + queue) → budget plan → LRU eviction (`unloadTiles`) → enqueue → await batch.

Each load cycle SHALL await the completion of its enqueued batch before the next cycle begins. If a camera event arrives during an active cycle, the system SHALL schedule one additional cycle to run after the current one completes, collapsing any intermediate events into that single follow-up.

The concurrency limit of `maxConcurrentRequests` (default 4) SHALL apply within each batch — nodes within a batch may load in parallel up to this limit.

#### Scenario: Second camera event during active cycle schedules one retry

- **GIVEN** a load cycle is active (nodes are loading)
- **WHEN** two camera events arrive before the cycle completes
- **THEN** exactly one follow-up cycle SHALL run after the current one, using the latest camera position
- **AND** no further concurrent cycles SHALL start

#### Scenario: Load respects concurrency limit within batch

- **GIVEN** a batch of 20 nodes to load and maxConcurrentRequests = 4
- **WHEN** the cycle starts loading
- **THEN** at most 4 nodes SHALL be "loading" simultaneously at any point

### Requirement: Selective stale request cancellation

At the start of each cycle, before eviction, the system SHALL call `_cancelStaleRequests(candidateKeys)`. This function SHALL:

1. Abort in-flight loads for nodes whose key is NOT in `candidateKeys` — call `_loadController.abort()`, immediately set state to `"pending"`, release budget (`_totalLoadedPoints -= node.pointCount`)
2. Purge stale entries from the loading queue — rebuild the priority queue, keeping only nodes in `candidateKeys`, resetting removed entries to `"pending"` state

#### Scenario: Stale in-flight load aborted and budget released

- **GIVEN** node N is `"loading"` but not in current candidates
- **WHEN** `_cancelStaleRequests` runs
- **THEN** N's controller SHALL be aborted
- **AND** `N.state` SHALL immediately become `"pending"`
- **AND** `_totalLoadedPoints` SHALL be decremented by `N.pointCount`

#### Scenario: Stale queue entry removed

- **GIVEN** node N is in `_loadingQueue` but not in current candidates
- **WHEN** `_cancelStaleRequests` runs
- **THEN** N SHALL be removed from the queue and state set to `"pending"`

### Requirement: computeRetryDelay — pure function

`computeRetryDelay(error, retryCount)` SHALL return milliseconds until next retry:
- If error is `CopcCacheError` (HTTP 502/503/504): `baseDelay = 10_000`
- Otherwise: `baseDelay = 1_000`
- Delay = `Math.min(baseDelay × 2^retryCount, 60_000)`

#### Scenario: Cache error with 2 prior retries

- **GIVEN** `error` is `CopcCacheError`, `retryCount = 2`
- **WHEN** `computeRetryDelay(error, retryCount)` is called
- **THEN** result SHALL be `Math.min(10_000 × 4, 60_000) = 40_000`

#### Scenario: Generic error with no prior retries

- **GIVEN** `error` is `Error("timeout")`, `retryCount = 0`
- **WHEN** `computeRetryDelay(error, retryCount)` is called
- **THEN** result SHALL be `1_000`

### Requirement: Per-node typed array storage

When a node reaches `"loaded"` state, the system SHALL store its processed data in per-node typed arrays on the `CachedNode` object:

- `node.positions`: `Float32Array` of length `pointCount × 3`
- `node.colorsRgb`, `node.colorsElevation`, `node.colorsIntensity`, `node.colorsClassification`: `Uint8Array` of length `pointCount × 4` each (RGBA, all four schemes pre-computed by worker)
- `node.intensities`: `Float32Array` of length `pointCount`, or `undefined` if the source has no intensity channel
- `node.classifications`: `Uint8Array` of length `pointCount`, or `undefined` if the source has no classification channel

These arrays SHALL be populated by the main thread from Transferable typed arrays returned by the processing worker.

#### Scenario: Node loads and stores per-node arrays

- **GIVEN** a node with 100k points transitions from `"loading"` to `"loaded"`
- **WHEN** the worker returns processed data
- **THEN** `node.positions` SHALL be a `Float32Array` of length 300k
- **AND** `node.colorsRgb` SHALL be a `Uint8Array` of length 400k (RGBA)

#### Scenario: Node without intensity channel has undefined intensities

- **GIVEN** a source with no intensity dimension (e.g., RGB-only LAS 1.4 point format 7)
- **WHEN** the node loads
- **THEN** `node.intensities` SHALL be `undefined`

#### Scenario: Worker returns Transferable arrays

- **GIVEN** the processing worker completes decoding a node
- **WHEN** the result is posted to the main thread
- **THEN** the typed arrays SHALL be transferred (not copied), zero-copy from worker to main thread

### Requirement: Hierarchy expansion uses per-node pages

The `HierarchyLoadTracker` SHALL store a `Map<string, Hierarchy.Page>` from child key to its hierarchy page, populated during `_registerNodesOnce`. When `_runCycle` processes pending hierarchy expansions, it SHALL use the correct per-node page (from `HierarchyLoadTracker.pageByKey.get(key)`) instead of `_rootHierarchyPage`.

#### Scenario: Deep hierarchy expansion uses correct page

- **GIVEN** `_registerNodesOnce` loaded a subtree with pages for keys `"3-1-2-0"` and `"3-1-2-1"`
- **WHEN** `_runCycle` expands hierarchy for key `"3-1-2-0"`
- **THEN** the expansion SHALL use the page stored at `pageByKey.get("3-1-2-0")`, not `_rootHierarchyPage`

### Requirement: Priority-based request scheduling (not yet wired into loading flow)

The system provides a `RequestScheduler` singleton (`scheduling/RequestScheduler.ts`) with priority-based concurrency management, but node loads currently bypass it — using the legacy `_loadingQueue` (MinHeap) directly. Only `RequestScheduler.update()` is called once per cycle; `.request()` is never invoked.
- `maximumRequests` (default 6): global concurrency cap
- `maximumRequestsPerServer` (default 4): per-server cap
- A `PriorityHeap` of waiting requests, sorted by priority function

When a request is submitted, if throttle slots are available, the request SHALL start immediately. Otherwise, it SHALL enter the PriorityHeap. The heap SHALL truncate at `maximumLength` (default 20), cancelling the lowest-priority entry on overflow.

Model: Cesium's `RequestScheduler.js`.

#### Scenario: Global concurrency cap enforced

- **GIVEN** `maximumRequests = 6` and 8 requests submitted
- **WHEN** 6 are active and 2 wait in the heap
- **THEN** new requests SHALL wait until an active slot frees

#### Scenario: Heap overflow cancels lowest-priority request

- **GIVEN** `maximumLength = 20` and 20 requests waiting at ascending priority
- **WHEN** a 21st request arrives with higher priority than the lowest queued
- **THEN** the lowest-priority queued request SHALL be cancelled, and the new request SHALL enter the heap

---

## 7. Render

### Requirement: Render visibility — frustum and SSE filter

The system SHALL provide `computeVisibleCachedNodes` that filters cached nodes for rendering using a two-stage filter:

1. **Frustum culling**: 8-corner AABB projection to deck.gl common space + `isAabbInFrustumPlanes` (4 side planes only)
2. **SSE LOD**: render the coarsest node passing SSE per subtree; skip descendants of SSE-passing nodes; render nodes without loaded children as fallback

The function SHALL NOT modify any node state, access the network, or know about `pointBudget`.

Nodes SHALL be sorted by depth ASC for SSE evaluation.

**Ancestor-content fallback**: When a node fails SSE AND has no loaded children in cache, the system SHALL check `node._ancestorWithContentAvailable`. If it references a loaded node, the ancestor SHALL be rendered instead. If the ancestor was evicted, the system SHALL walk up via `ancestor.parent` to find the next loaded ancestor. If no loaded ancestor exists, the node itself SHALL be rendered.

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

#### Scenario: Node fails SSE, ancestor with content available

- **GIVEN** node N at depth 4 fails SSE and has no loaded children
- **AND** `N._ancestorWithContentAvailable` points to node A at depth 1 with `state === "loaded"`
- **WHEN** `computeVisibleCachedNodes` evaluates N
- **THEN** ancestor A SHALL be rendered instead of N

#### Scenario: Node fails SSE, recorded ancestor evicted

- **GIVEN** `N._ancestorWithContentAvailable` references node A with `state === "pending"` (evicted)
- **AND** A's parent at depth 0 has `state === "loaded"`
- **WHEN** `computeVisibleCachedNodes` evaluates N
- **THEN** the system SHALL walk up via `A.parent` and render the depth-0 node

### Requirement: Ancestor content chain propagation

After each traversal returns candidates, the system SHALL:
1. Populate `parent` field on each candidate node by computing the parent key and looking it up in `nodeCache`
2. Call `updateTileAncestorContentLinks(node, frameNumber)` for each candidate in depth order to propagate the `_ancestorWithContentAvailable` chain from parent to child

#### Scenario: Chain propagates from root to depth-4

- **GIVEN** root (depth 0) is loaded, nodes depth 1-4 are pending
- **AND** `parent` references are set (depth-N → depth-(N-1))
- **WHEN** `updateTileAncestorContentLinks` is called for all candidates in depth order
- **THEN** depth-4's `_ancestorWithContentAvailable` SHALL point to root

### Requirement: filterFrustumVisible — pure function

`filterFrustumVisible(nodeCache, camera)` SHALL return `CachedNode[]` filtered by frustum visibility and sorted by depth ASC.

It SHALL project each node's AABB to common space and test with `isAabbInFrustumPlanes`. The returned array SHALL be sorted by numeric depth (not lexicographic key sort).

#### Scenario: Sorted by depth ascending

- **GIVEN** 3 visible nodes at depths 5, 2, 8
- **WHEN** `filterFrustumVisible(nodeCache, camera)` is called
- **THEN** result SHALL be `[depth2, depth5, depth8]`

### Requirement: applySSEFilter — pure function

`applySSEFilter(frustumVisible, nodeCache, camera, geometricErrorByDepth, maxScreenErrorPx)` SHALL apply SSE LOD selection and return visible node keys for rendering.

It SHALL:
- Maintain a `covered` set: when a node passes SSE (screenError ≤ maxScreenErrorPx), add it to output and mark all its descendants as covered
- Nodes failing SSE with loaded children descend; without loaded children use ancestor fallback

#### Scenario: SSE-passing node covers descendants

- **GIVEN** node A at depth 2 passes SSE, node B at depth 3 is a descendant of A
- **WHEN** `applySSEFilter(...)` processes A
- **THEN** A SHALL be in output; B SHALL be skipped (covered)

### Requirement: RenderBufferPool manages grow-only buffers

`RenderBufferPool` SHALL manage mutable grow-only `Float32Array` and `Uint8Array` buffers for zero-copy render data assembly from per-node typed arrays.

`build(visibleKeys, nodeCache, activeScheme, coordinateOrigin, bounds)` SHALL:
- Allocate new buffers if capacity insufficient (grow-only, never shrink)
- Populate `positions` (XYZ offsets in LNGLAT_OFFSETS format) and `colors` (RGBA from active scheme)
- Return `PointCloudData` with `positions`, `colors`, `coordinateOrigin`, `pointCount`, `bounds`
- Return `null` if no visible nodes have loaded data
- Return `subarray()` views — zero-copy, valid until next `build()` call

Color scheme selection: `activeScheme` (`"rgb"`, `"elevation"`, `"intensity"`, `"classification"`) selects from corresponding per-node arrays (`colorsRgb`, `colorsElevation`, `colorsIntensity`, `colorsClassification`).

#### Scenario: First build allocates buffers

- **GIVEN** a `RenderBufferPool` with `initialCapacity = 0`
- **WHEN** `build()` is called with 100k points total
- **THEN** internal buffers SHALL be allocated to fit 100k points and the function SHALL return `PointCloudData`

#### Scenario: Buffer grows on demand

- **GIVEN** `RenderBufferPool` with capacity for 50k points
- **WHEN** `build()` is called with 80k points
- **THEN** new buffers SHALL be allocated with capacity ≥ 80k points

#### Scenario: Subarrays reference same underlying buffer

- **GIVEN** `build()` returns `data1` with positions
- **WHEN** the caller reads `data1.positions[0]`
- **THEN** the value SHALL be from the pool's internal buffer (no copy)

#### Scenario: No loaded nodes returns null

- **GIVEN** all visible keys have `state !== "loaded"`
- **WHEN** `build()` is called
- **THEN** the result SHALL be `null`

#### Scenario: Output shape correct

- **GIVEN** 2 visible loaded nodes with 50k points each
- **WHEN** `build()` is called
- **THEN** `data.positions.length` SHALL be `300000` (100k × 3) and `data.colors.length` SHALL be `400000` (100k × 4)

### Requirement: Render pipeline independence

The render pipeline SHALL NOT call any loading functions. The loading pipeline SHALL NOT call any render functions.

The render pipeline SHALL read `nodeCache` but SHALL NOT write to it.

#### Scenario: Render pipeline does not trigger network requests

- **GIVEN** the render pipeline runs with a set of visible cached nodes
- **WHEN** monitored for network activity
- **THEN** no fetch requests SHALL be initiated by the render path

### Requirement: Render update triggers

The render pipeline SHALL invoke on every viewport-change callback from `ViewportManager`, independently of the loading pipeline's debounce.

It SHALL skip buffer rebuild when the visible key set is identical to the last render (set-equality via hash).

It SHALL also be invoked after each loading cycle's drain completes, to pick up newly loaded nodes.

#### Scenario: Render updates when visible set changes

- **GIVEN** camera pans so a previously visible node exits the frustum and a new node enters
- **WHEN** the viewport-change callback fires
- **THEN** the render pipeline SHALL rebuild the buffer with the new visible set

#### Scenario: Render skipped when visible set unchanged

- **GIVEN** camera pans slightly but the same set of nodes remains visible
- **WHEN** the viewport-change callback fires
- **THEN** no buffer rebuild SHALL occur

---

## 8. Deploy

### Requirement: PointCloudLayerFactory as pure function

The system SHALL replace the `PointCloudLayerFactory` class with a single exported function `createPointCloudLayer(layerId, data, config, version?)` that returns a deck.gl `Layer`. The function SHALL have no side effects beyond creating the layer object.

#### Scenario: Function creates layer

- **GIVEN** valid `PointCloudData` and `PointCloudLayerConfig`
- **WHEN** `createPointCloudLayer("layer-1", data, config)` is called
- **THEN** the result SHALL be a deck.gl `PointCloudLayer` with provided data and config

### Requirement: Parent fallback and eviction hysteresis

The system SHALL implement 2-frame hysteresis for eviction: a node with `lastSeenAt >= currentFrame - 1` SHALL NOT be evicted, even if it is not a candidate in the current cycle. This prevents thrashing at boundary conditions.

Additionally, a loaded parent node SHALL NOT be evicted while any of its octree children are in `"loading"` or `"error"` state, or present in the current `toLoadSet`. The child state check SHALL use `toLoadSet` (in addition to checking `state === "loading"`) to cover the gap between enqueue and fetch start.

#### Scenario: Parent visible while child loads

- **GIVEN** a parent node with two children, both pending
- **WHEN** traversal selects children as candidates and parent as fallback
- **THEN** the parent SHALL remain rendered until at least one child loads

#### Scenario: Parent with queued child is protected

- **GIVEN** parent P is loaded, child C is in `toLoadSet` but still `"pending"`
- **WHEN** eviction evaluates P
- **THEN** P SHALL be skipped (child is about to start loading)

#### Scenario: Parent with error child is protected

- **GIVEN** parent P is loaded, child C has state `"error"` (awaiting retry)
- **WHEN** eviction evaluates P
- **THEN** P SHALL be skipped

---

## 9. Infrastructure & Types

### Requirement: Grouped parameter objects

The following parameter groups SHALL be defined:

**`PriorityOptions`** (for `updatePriority`):
- `preferLeaves?: boolean`
- `priorityProgressiveResolution?: boolean`
- `isSkippingLevelOfDetail?: boolean`

**`SSECameraContext`** (for `getScreenSpaceError`):
- `fovVerticalRadians: number`
- `screenHeightPx: number`
- `pixelRatio: number`

### Requirement: RawLasFields — canonical raw extraction type

The system SHALL define `RawLasFields` in `workers/pointProcessing.types.ts` as the single canonical type for raw LAS field extraction from a COPC data view. The type SHALL contain per-dimension typed arrays: `x` (`Float64Array`), `y` (`Float64Array`), `z` (`Float32Array`), `intensity` (`Uint16Array`), `classification` (`Uint8Array`), and optionally `r`, `g`, `b` (`Uint16Array | null` each, null when the source has no color channel). The type SHALL be imported by both `rawExtraction.ts` and the processing worker.

#### Scenario: RawLasFields groups all raw arrays

- **GIVEN** COPC data with XYZ, intensity, classification, and RGB channels
- **WHEN** `readRawLasFields(view, n, hasColor)` is called
- **THEN** a single `RawLasFields` object SHALL contain `x`, `y`, `z`, `intensity`, `classification`, `r`, `g`, `b` fields with non-null color arrays

#### Scenario: Source without color produces null color fields

- **GIVEN** COPC data without RGB channels (point format without color)
- **WHEN** `readRawLasFields(view, n, false)` is called
- **THEN** `r`, `g`, `b` SHALL each be `null`

### Requirement: Remove [key: string]: unknown from internal types

The types `CacheListNode<T>` and `PriorityHeapEntry` SHALL NOT have `[key: string]: unknown` index signatures. All accessed properties SHALL be explicitly typed.

#### Scenario: CacheListNode has explicit properties only

- **GIVEN** `CacheListNode<T>` type definition
- **THEN** the type SHALL have exactly `item: T`, `prev: CacheListNode<T> | null`, `next: CacheListNode<T> | null`, `isProtected: boolean` — no index signature

### Requirement: Worker types deduplication

The `workers/pointProcessing.types.ts` file SHALL contain the single `ProcessRequest` and `ProcessResult` interfaces. The worker SHALL import them via `./pointProcessing.types`. The main thread SHALL use `Omit<ProcessRequest, 'requestId'>` as the payload type. No inlined duplicates SHALL exist.

### Requirement: Shared geometry utilities

The system SHALL provide geometry utilities in `geometry/crs.ts` (`extractProjcsFromWkt`) and `geometry/wgs84.ts` (`clampLatLng`), both importable via relative paths without `@core`. Both the main thread (`CopcStreamingLoader`, `initCopc`) and the processing worker SHALL import these functions from their respective files to avoid code duplication.

#### Scenario: Both loader and worker use same implementation

- **GIVEN** the worker and main thread both need `extractProjcsFromWkt`
- **WHEN** either imports the function
- **THEN** both SHALL import from `geometry/crs.ts`, eliminating code duplication

#### Scenario: Clamp is shared between main thread and worker

- **GIVEN** the worker and main thread both need `clampLatLng`
- **WHEN** either imports the function
- **THEN** both SHALL import from `geometry/wgs84.ts`, eliminating code duplication

### Requirement: Skip-LOD traversal with ancestor replacement (not yet wired)

The system provides pure functions for level-of-detail (LOD) skipping (`traversal/lodSeparation.ts`, `traversal/skipTraversal.ts`), but they are not yet wired into `traverseOctree`.

A tile SHALL be un-skipped (must load) when BOTH conditions are met:
1. `tile.screenSpaceError < ancestor.screenSpaceError / skipScreenSpaceErrorFactor` (default factor: 16)
2. `tile.depth > ancestor.depth + skipLevels` (default skipLevels: 1)

Where `ancestor = tile._ancestorWithContent` (nearest ancestor with loaded or loading content).

#### Scenario: Both SSE and depth thresholds met — tile loads

- **GIVEN** ancestor SSE = 400, depth = 5, tile SSE = 20, depth = 7, factor = 16, levels = 1
- **WHEN** `reachedSkippingThreshold()` is called
- **THEN** the tile SHALL be un-skipped (loaded): 20 < 25 AND 7 > 6 → both met

#### Scenario: Only SSE met, depth insufficient — tile stays skipped

- **GIVEN** ancestor SSE = 400, depth = 6, tile SSE = 20, depth = 6, factor = 16, levels = 1
- **WHEN** `reachedSkippingThreshold()` is called
- **THEN** the tile SHALL remain skipped: 20 < 25 but 6 ≤ 7 → only one condition met

## 10. Performance Guarantees

### Requirement: Octree traversal uses iterative explicit stack

The octree traversal SHALL use an explicit stack (not recursion) to visit nodes. The traversal order SHALL be DFS pre-order, identical to recursive `visitNode`. There SHALL be no recursion depth bound beyond available memory.

#### Scenario: Traversal produces same candidates as recursive version

- **GIVEN** a node cache with an octree of depth 14 and the same camera snapshot
- **WHEN** `traverseOctree` runs with iterative traversal
- **THEN** the returned candidate list SHALL have the same keys in the same order as the recursive version

#### Scenario: Deep octree traversal does not overflow

- **GIVEN** a node cache with octree depth 20
- **WHEN** `traverseOctree` runs
- **THEN** the traversal SHALL complete without stack overflow

### Requirement: Culling and metrics inputs use mutable shared context

`shouldCullNode` and `computeNodeMetrics` SHALL accept per-node fields (`key`, `node`, `depth`) as separate positional arguments or via a shared mutable context object rather than requiring a new object allocation per call.

#### Scenario: Zero allocation per visited node

- **GIVEN** 1000 nodes are visited during traversal
- **WHEN** traversal completes
- **THEN** fewer than 20 object allocations SHALL have been performed within the visit loop (excluding result data structures)

### Requirement: Frustum-visible sort precomputes depth

`filterFrustumVisible` SHALL parse each node's octree key depth exactly once, before sorting. The sort comparator SHALL compare precomputed depth values, not parse octree keys.

#### Scenario: Octree key not parsed in sort comparator

- **GIVEN** 500 frustum-visible nodes
- **WHEN** `filterFrustumVisible` runs
- **THEN** `parseOctreeKey` SHALL be called exactly 500 times (once per visible node), not during any comparison step

### Requirement: Budget plan running-point accumulation is incremental

`computeBudgetPlan` SHALL track the running point total incrementally by accumulating accepted node sizes. It SHALL NOT re-scan the entire node cache to compute the running total within inner loops.

#### Scenario: Node cache scanned once for occupied budget

- **GIVEN** a node cache with 1000 nodes, 200 candidates
- **WHEN** `computeBudgetPlan` runs
- **THEN** the full node cache SHALL be scanned at most once (by `computeOccupiedBudget`)

### Requirement: Render-set integrity check is O(1)

The render-set change detection SHALL use an O(1) integrity check (length XOR with first-key XOR with last-key) rather than O(N) string joining of all visible keys.

#### Scenario: Changed render set is detected

- **GIVEN** visible keys change from `["1-0-0-0", "1-1-0-0", "2-0-0-0"]` to `["1-0-0-0", "1-1-0-0", "2-1-0-0"]`
- **WHEN** the integrity check runs
- **THEN** the check SHALL return a value different from the last stored hash

#### Scenario: Identical render set is skipped

- **GIVEN** visible keys are unchanged from the previous cycle
- **WHEN** the integrity check runs
- **THEN** `onPointsLoaded` SHALL NOT be called

### Requirement: depthDistribution accumulates across cycles

The `depthDistribution` counter SHALL accumulate node counts as nodes are discovered across all cycles. It SHALL NOT be cleared before each new cycle's hierarchy loading step. The `maxDepthInHierarchy` SHALL be the maximum depth across all discovered nodes, not reset to zero.

#### Scenario: depthDistribution persists after first cycle

- **GIVEN** a first cycle discovered 100 nodes at depth 4
- **WHEN** a second cycle runs with no new nodes discovered
- **THEN** `depthDistribution.get(4)` SHALL return 100 (not 0 or undefined)

### Requirement: Budget check in load handler is defensive-only

`_loadNode` SHALL NOT perform a budget gate (`totalLoadedPoints + pointCount > pointBudget`) at the point of individual node loading. Budget enforcement SHALL occur during the cycle planning phase (`_planAndEvict`), before `drain` is called. The `_loadNode` handler MAY keep no-op assertions but SHALL NOT reject loads based on budget.

#### Scenario: Load proceeds without budget re-check

- **GIVEN** a cycle plan has determined that node X fits within budget
- **WHEN** `_loadNode(X)` is called during `drain`
- **THEN** the load SHALL proceed without re-checking `totalLoadedPoints + pointCount` against `pointBudget`