# ADR-0022: Feature selection

Status: Accepted · Date: 2026-11-14

## Context

Mapdeck had no feature selection: the attribute table carried an unwired
`selectedRowIds` set, and nothing on the map could select. The requested
behaviour is QGIS-like — selection per layer, one target layer at a time,
three ways to select (map click, map rectangle, attribute-table row), a
panel with per-layer counts and add/remove/clear tools, an on-map
highlight with a configurable color, and selection state synchronized
between the map and the table. Selection must survive deactivating the
tool; the app persists nothing, so selection is session state.

The identity problem comes first: a table row is keyed by
`getFeatureId` (first id-like property, else the row index), while map
picks identify features by deck object ids or pick indices — two
vocabularies that do not match in general.

## Decision

- **Shared state, one instance.** `SelectionStore`
  (`src/core/common/selection/`) holds `layerNodeId → featureKey →
  SelectionRecord`, where a record carries what is known about the
  feature's location: exact geometry (map picks), a point position
  (point clouds), or a bbox (table rows, which carry `_bbox` only). The
  instance lives in the `StateStore` under `"feature-selection"` and is
  created on first access (`ensureSelectionState`) — the ADR-0005
  stateStore-keyed coordination pattern, not a registry entry: widgets,
  map tools and the map viewer all reach it without widening
  `ToolRuntimeContext`.
- **One feature-key convention.** `stableFeatureKey` (same module)
  probes the GeoJSON feature-level id first (the attribute pipeline
  surfaces it as the `_featureId` row field, ADR-0013), then id-like
  properties; only `feature-<id>` keys match across surfaces. Fallbacks
  are surface-local by design — table rows fall back to `row-<i>`, map
  picks to `pick-<i>` — so an unstable id can never sync the wrong
  rows. The panel and the table surface this as a "no stable ids" hint;
  a refresh or re-sort drops only index-keyed selections. The target
  layer defaults to the topmost visible layer.
- **One map tool, one target layer.** The `selection` interactive map
  tool (`src/map-tools/selection/`) owns interaction only: left-click
  picks the target layer's feature, left-drag picks a rectangle
  (drag-pan is suspended while attached). Combining picks with the
  existing selection is the panel's mode (new/add/remove), never
  keyboard state. Both pick channels are queried and merged:
  `map.queryRenderedFeatures` for native layers and
  `OverlayManager.pickObjects` (widened with an optional rectangle,
  inside the ADR-0010 exception) for deck layers. The channels cannot
  be told apart by `map.getLayer` — deck's interleaved layers register
  as internal maplibre layers too — and are disjoint by construction, so
  the union needs no tie-breaking.
- **Highlight outside the layer manager.** The map viewer mounts
  `useSelectionHighlight`, which renders one `GeoJsonLayer`
  (`selection-highlight`) from the records through `useOverlayLayers` —
  the ADR-0010 pattern of tool overlays, but tool-independent so the
  selection outlives deactivation. Table-originated selections draw as
  their bbox rectangle; exact geometry is a deliberate v1 cut (rows
  carry no geometry, ADR-0013). Hidden layers' selections stay in the
  store but are not drawn.
- **Selection color** is the tool's setting (`selection.color`,
  default QGIS-like yellow), rendered by the settings widget through
  the new color setting type (ADR-0023).

## Consequences

- Selection state is observable MobX in a common subsystem; pure set
  operations live beside it in `logic/` and are unit-tested without a
  store.
- Deck rectangle picks render at a reduced resolution — small features
  inside a large rectangle can be missed; an acceptable approximation,
  documented on the port.
- Layers without an id-like property select fine on their surface of
  origin but never sync between map and table; vector-tile features
  frequently lack ids.
- The attribute table's selection methods delegate to the shared store;
  `selectAllRows` remains (tested) but no select-all affordance ships —
  it is out of the requested scope.
- Follow-ups deliberately not done: exact geometry for table-originated
  selections (needs an attribute-pipeline contract change), a
  selected-only table filter, and persisted selection.
