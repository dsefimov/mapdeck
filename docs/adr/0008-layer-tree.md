# ADR-0008: Layer tree — pure operations over a domain model, presentation state apart

## Context

The layer tree is the central structure of the app. Source data arrives as a hierarchy
of group and layer nodes; the map renders from a snapshot of it; the Layers widget
presents it with expansion, menus and search; layer tools (ADR-0007) act on single
nodes. The tree has two consumers with different needs — the map wants a stable
structural snapshot, the UI wants interactive presentation state. Two data realities
shape it further: hierarchies can be arbitrarily deep, so children must arrive lazily;
and the source may refresh at any time, so user edits must survive. This ADR records
how the tree is modeled and split between domain and presentation.

## Decision

**The node model is data, not presentation.** `TreeNode` is a union of `GroupNode` and
`LayerNode` discriminated by `type`, with guards. The shared base carries `id`, `title`,
`description`, `metadata`, `parentId`, `bbox`, `isVisible`, `relatedObjects`. `GroupNode`
adds `childrenIds` (a plain id list at contract level — the store's deep wrapping
provides observability, so contracts stay MobX-free) and `childrenCount`; `LayerNode`
adds the
`renderer` binding, an optional `data` binding, an optional `style` override (the
protocol's default style applies when absent), the capability list (`{toolId, slot}`
entries — assigned by the source, semantics in ADR-0009), and an optional `legend`.
Nodes carry no
view fields — expansion, menu and search state never live on a node. The tree consumes
protocol bindings and capabilities as data; their assignment belongs to the source area
(ADR-0009).

**Pure operations over a `TreeState` interface.** Domain operations never touch MobX:
they navigate through `TreeState` (`getNode`, `childrenOf`, `rootIds`), which the store
implements over its observable maps. Every operation is a deterministic pure function. Why the interface: operations stay
testable without MobX and
cannot accidentally observe storage internals.

**Structural mutations: one result, one application point.** The structural operation
`reconcileTree` returns the ids to remove — descendants included — and the store
applies them through the single `applyResult` entry point, registering and ordering
nodes from the incoming batch. Why: root reload and subtree reload write the tree
through the same path, so the structural mutation rules exist in exactly one place.
User edits are a different mechanism by design: visibility and style overrides are
direct writes to a node's observable fields — precisely the state `mergeUserState`
preserves on reload.

**Operations are the primary abstraction.** The store calls domain operations and
applies their results; it holds no business rules of its own. The catalog: `reconcileTree`
(diffs incoming nodes against the tree under a parent, including descendant removal),
`mergeUserState` (the existing node's `isVisible` and `style` overrides survive, all
structural fields come from the incoming node), `cascadeVisibility` (an async walk with
a `loadChildren` callback — showing loads unloaded groups first, hiding touches only
loaded descendants; a re-toggle aborts the in-flight subtree load), `searchTree` (composes `traverseTreeAsync` with `matchesQuery`,
lazy-loads unloaded groups, honors abort, returns matched ids only — ancestor paths and
row shaping are the caller's concern), the traversal helpers (`collectLayerNodes`,
`collectVisibleBboxes`, `resolveNodes`, `collectSubtreeIds`), `idsToRemove`,
`styleMutators`, and `toSnapshotItems` (collect + descriptor resolution via the
protocol registry).

**Visibility is one flag.** `node.isVisible` means participation in map rendering — the
effective visibility. There is no requested/effective pair (QGIS-style): the visibility
cascade flattens group state into the leaves, so a divergence between "wanted" and
"rendered" cannot arise.

**Lazy loading: one path.** `ensureChildrenLoaded(groupId)` fetches a group's children
through the `SourceAdapter` port when they have not arrived yet and is a no-op
otherwise; it accepts an abort signal. The store tracks which groups have received
their child batch — an empty batch counts as loaded, so an empty group is not
re-fetched on every expand; deleting the group clears the marker. Expansion, search
traversal and the show-cascade all load
through this single path. Why: a tree can be arbitrarily deep, and eager fetching is
not acceptable. The tree loads exclusively through `SourceAdapter`
(`fetchRoot`/`fetchChildren`); the adapter is chosen from the configured source type
and re-initialized when the source-URL setting changes.

**The snapshot is the tree's output.** `layerSnapshot` is a computed that collects
layer nodes and resolves their descriptors, compared with structural equality — the map
reacts only when render-relevant content actually changes. Descriptor semantics belong to ADR-0009.

**Unrenderable nodes are marked, not hidden.** A layer node whose descriptor cannot be
resolved — its renderer protocol is not registered, or the resolved descriptor has an
empty source URL — is excluded from the snapshot (ADR-0010) and marked in the tree: the
row renders muted with the reason, and the visibility toggle and menu actions are
disabled. The mark is derived from the same predicate the snapshot applies, so the tree
cannot present a node as usable when the map cannot render it. The node is not an error
and not hidden: it is source-provided data the core cannot render, and the tree stays a
mirror of the source.

**Presentation state lives in the view model.** `LayerTreeViewModel` — widget instance
state obtained through `stateStore.get`, keyed by the widget id — owns `expandedIds`,
`openMenuId`, `searchQuery` and `matchedIds`, and computes the flat `visibleRows`
(`{nodeId, depth}`) the widget renders: expansion mode (rows for roots and children of
expanded groups), or search mode (matched nodes plus their ancestor paths, regardless
of expansion) when a query is active and no run is pending. While a run is pending —
the debounce waiting or a search in flight — the expansion view stays, so the tree
does not flash empty on every keystroke. The search lifecycle is owned by the
view model: the query is trimmed, debounced (300 ms), a newer query aborts the in-flight
run, and a failed run clears the matches. Expanding a group triggers the lazy load;
a failed or aborted load rolls the group back to collapsed. Expansion is independent of
visibility: turning a group visible loads and shows its layers on the map but never
expands the tree. View state survives reloads
by stable node ids — stale ids produce no rows — and there is deliberately no reset
method. Why a view model and not node fields: nodes are recreated on every reload, so
node-held presentation state would be lost exactly when it matters; keying by id makes
the state survive while keeping presentation concerns out of the domain model.

**Errors are split by channel.** Operation failures live in a keyed async state, one key
per operation; the last failed run drives the widget's error banner, and a state-level
error (e.g. the source URL was cleared) takes precedence. Visibility-cascade failures
stay per-node and deliberately do not drive the banner — a failed toggle is not a
tree-level failure. Render failures are a separate per-node channel: the layer manager
reports them, the tree store keeps them by node id, and rows read them — the widget
tracks nothing locally. Why two channels: one is about loading the data, the other
about rendering what was loaded.

**Reports travel in `relatedObjects`.** The tree reads report links from a node's
`relatedObjects` (objects whose `type` is `"report"`) — never from `metadata` — and the
search predicate matches a node by its title, description, or the title/description of
its report links.

## Consequences

- Store code holds no business rules: every rule lives in a pure operation.
- The single mutation path prevents the load paths from drifting apart.
- View state can never be lost to a reload that keeps node ids, and never survives
  nodes that vanished.
- Search and the show-cascade are the two deliberate full-fetch paths: both materialize
  the entire reachable subtree by loading unloaded groups on the way — the accepted
  cost of correctness for arbitrarily deep trees.
- The map observes exactly one signal — the structural snapshot — and nothing else.
