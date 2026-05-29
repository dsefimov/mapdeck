# NodeRole System

## Concept

Every tree node declares its capabilities as roles. Core knows nothing about external data formats — modules translate their source data into roles.

NodeRole is a strict discriminated union: `DisplayRole | AttributeRole | ReportRole`.

---

## Role Categories

| Category | Cardinality | Purpose |
|----------|-------------|---------|
| `display` | **Exactly one** | Layer config for rendering on the map |
| `attribute` | **Zero or one** | Endpoint for fetching attribute data |
| `report` | **Zero or more** | Download links (files, metadata) |

**Rule**: If a module receives multiple display or attribute candidates from its source, it resolves to one before creating the TreeNode. Core expects at most one of each.

---

## Display Roles

A display role connects a node to a visual representation on the map. The `render: RenderDescriptor` field bundles three things:

- `role` — which `LayerAdapter` to use (`raster`, `vector`, `point-cloud`, etc.)
- `sourceUrl` — the data source URL
- `config` — rendering parameters (type-specific, e.g. `RasterLayerConfig`)

| Layer Role | What it renders | Config type |
|------------|----------------|-------------|
| `raster` | Tile layers (XYZ, WMS, COG/GeoTIFF) | `RasterLayerConfig` |
| `vector` | Vector tiles (fill, line, circle, symbol) | `VectorLayerConfig` |
| `point-cloud` | COPC/LAZ point clouds with streaming | `PointCloudLayerConfig` |
| `vector3d` | 3D lines, paths, vectors | `Vector3DLayerConfig` |

Each layer role is handled by a dedicated `LayerAdapter` that knows how to add/remove/update that type on the map.

See: [`src/core/framework/types/domain/layer/descriptor.ts`](../../../src/core/framework/types/domain/layer/descriptor.ts)

---

## Attribute Roles

An attribute role provides an endpoint for fetching tabular data associated with a node:

| Source Type | What it provides |
|-------------|-----------------|
| WFS endpoint | OGC Web Feature Service — paginated feature tables |
| OGC Feature API | REST feature collection with query support |
| GeoJSON/CSV URL | Static file with feature attributes |

The module resolves multiple attribute sources to one primary endpoint. Additional sources can be exposed as metadata if needed.

---

## Report Roles

A report role is a downloadable asset — no config, just a URL and label:

| Type | Example |
|------|---------|
| PDF report | Generated analysis document |
| Metadata file | ISO 19115, FGDC metadata |
| Raw data export | CSV, GeoJSON dump |

Multiple reports per node are allowed.

---

## Type Structure

NodeRole is a strict discriminated union:

```ts
type NodeRole = DisplayRole | AttributeRole | ReportRole;
```

Roles are grouped into a structured container per node:

```ts
interface NodeRoles {
    display?: DisplayRole;     // at most one (optional for GroupNode)
    attribute?: AttributeRole; // zero or one
    reports: ReportRole[];     // any number
}
```

`LayerNode` requires at least one display role:

```ts
interface LayerNodeRoles extends NodeRoles {
    display: DisplayRole; // required
}
```

See: [`src/core/framework/types/domain/node/role.ts`](../../../src/core/framework/types/domain/node/role.ts)

---

## TreeNode Structure

```ts
type TreeNode = GroupNode | LayerNode;

interface TreeNodeBase {
    id: string;
    type: LayerTreeNodeTypes;
    title: string;
    description: string;
    icon: string;
    roles: NodeRoles;
    bbox: Bbox;
    parentId: string | null;
    metadata?: Record<string, unknown>;
    isVisible: boolean;
}

interface GroupNode extends TreeNodeBase {
    type: "GROUP";
    childrenIds: string[];
    isExtended: boolean;
}

interface LayerNode extends TreeNodeBase {
    type: "LAYER";
    roles: LayerNodeRoles; // display role is required
}
```

See: [`src/core/framework/types/domain/node/tree.ts`](../../../src/core/framework/types/domain/node/tree.ts)

## Module Responsibility

Modules resolve ambiguity at parse time:

```ts
// If multiple display candidates, pick by priority (e.g., vector > raster)
const chosenDisplay = resolveDisplayRole(assets);
```

Core never sees multiple display roles on a single node.

---

## Related

- [modules.md](../dev/modules.md) — How modules create TreeNodes with roles
- [layer-system.md](./layer-system.md) — How display roles connect to LayerAdapters
