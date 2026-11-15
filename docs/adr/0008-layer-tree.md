# ADR-0008: Layer tree model

Status: Accepted · Date: 2026-09-22

## Context

The layer tree is the central structure of the application. Source data is a hierarchy
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
`description`, `metadata`, `parentId`, `bbox`, `isVisible`, `relatedObjects` (report
links are read from here, not from `metadata`). `GroupNode` adds `childrenIds` (a plain
id list at contract level — the store's deep wrapping provides observability, so
contracts stay MobX-free) and `childrenCount`; `LayerNode` adds the `renderer` binding,
an optional `data` binding, an optional `style` override (the protocol's default style
applies when absent), the capability list (`{toolId, slot}` entries — assigned by the
source, semantics in ADR-0009), and an optional `legend`. Nodes carry no view fields —
expansion, menu and search state do not live on a node.

**Domain operations are pure functions over a `TreeState` interface.** Operations
navigate through `TreeState` (`getNode`, `childrenOf`, `rootIds`), which the store
implements over its observable maps; they never touch MobX. The interface keeps the
operations testable without MobX and unable to observe storage internals. Structural
mutations flow through a single application point: `reconcileTree` returns the ids to
remove — descendants included — and the store applies them, so root reload and subtree
reload write the tree through the same path. User edits are a separate mechanism:
visibility and style overrides are direct writes to a node's observable fields —
precisely the state `mergeUserState` preserves on reload. The operation catalog lives in
`src/core/domain/layer-tree/logic/` with colocated tests.

**Visibility is one flag.** `node.isVisible` means participation in map rendering — the
effective visibility. There is no requested/effective pair (QGIS-style): the visibility
cascade flattens group state into the leaves, so a divergence between "wanted" and
"rendered" cannot arise.

**Lazy loading has one path.** `ensureChildrenLoaded(groupId)` fetches a group's children
through the `SourceAdapter` port when they have not arrived yet and is a no-op
otherwise; it accepts an abort signal. Expansion, search traversal and the show-cascade
all load through this path. The tree loads exclusively through `SourceAdapter`
(`fetchRoot`/`fetchChildren`); the adapter is chosen from the configured source type and
re-initialized when the source-URL setting changes.

**The snapshot is the tree's output.** `layerSnapshot` is a computed that collects layer
nodes and resolves their descriptors, compared with structural equality — the map reacts
only when render-relevant content changes. Descriptor semantics belong to ADR-0009.

**Unrenderable nodes are marked, not hidden.** A layer node whose descriptor cannot be
resolved — its renderer protocol is not registered, or the resolved descriptor has an
empty source URL — is excluded from the snapshot (ADR-0010) and marked in the tree: the
row renders muted with the reason, and the visibility toggle and menu actions are
disabled. The mark is derived from the same predicate the snapshot applies, so the tree
cannot present a node as usable when the map cannot render it.

**Presentation state lives in the view model.** `LayerTreeViewModel` — widget instance
state obtained through `stateStore.get`, keyed by the widget id — owns `expandedIds`,
`openMenuId`, `searchQuery` and `matchedIds`, and computes the flat `visibleRows` the
widget renders: expansion mode, or — when a search is active — matched nodes plus their
ancestor paths regardless of expansion. Expanding a group triggers the lazy load;
expansion is independent of visibility: turning a group visible loads and shows its
layers on the map but does not expand the tree. View state survives reloads by stable
node ids; stale ids produce no rows. A view model rather than node fields, because nodes
are recreated on every reload.

**Errors are split by channel.** Operation failures live in a keyed async state and
drive the widget's error banner; visibility-cascade failures stay per-node; render
failures are a separate per-node channel reported by the layer manager (ADR-0010). The
first channel is about loading the data, the others about using and rendering what was
loaded.

## Consequences

- Store code holds no business rules: every rule lives in a pure operation with
  colocated tests.
- A single mutation path keeps the load paths from drifting apart.
- View state survives any reload that keeps node ids, and never outlives nodes that
  vanished.
- Search and the show-cascade are the two full-fetch paths: both materialize the entire
  reachable subtree by loading unloaded groups on the way — the accepted cost of
  correctness for arbitrarily deep trees.
- The map observes one signal — the structural snapshot — and nothing else.
