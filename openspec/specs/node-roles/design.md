# Node Roles — Design

## Context

The node-role system is the data model through which the portal understands what each tree node *is* and what it can *do*. Modules map external data formats (STAC, etc.) into structured roles. Core uses roles to determine rendering, tool availability, and attribute access.

## Types

### LayerRole — Branded String

`LayerRole` is a branded string (`string & { readonly [LayerRoleBrand]: void }`). A plain `string` is not assignable to `LayerRole` without explicit cast. This prevents accidental mixing of role names with arbitrary strings.

Source: `src/core/framework/types/domain/layer/role.ts`

Built-in role constants: `LayerRoles.RASTER`, `.VECTOR`, `.POINT_CLOUD`, `.GEOJSON`. Modules create custom roles via `LayerRoles.of("my-role")`.

### NodeRole — Discriminated Union

`NodeRole = DisplayRole | AttributeRole | ReportRole`, discriminated by `category: "display" | "attribute" | "report"`. The `category` field enables exhaustive type narrowing in `switch` statements.

Source: `src/core/framework/types/domain/node/role.ts`

### DisplayRole

Bundles a `RenderDescriptor` (role + sourceUrl + config) that the rendering pipeline uses to create map layers. Source URL and config travel together — no sync risk.

Source: `src/core/framework/types/domain/layer/descriptor.ts`

### AttributeRole

Points to a WFS/OGC Features endpoint for tabular data. Extension of `NodeRoleBase` with `attributeConfig: NodeAttributeConfig`.

### ReportRole

A downloadable asset — `sourceUrl` is the download link, `label` is the display name. Extension of `NodeRoleBase` with no additional config.

### NodeRoles Container

`NodeRoles` is a plain object holding the structured roles for a tree node. It has four fields:
- `display` — optional `DisplayRole` (0..1)
- `attribute` — optional `AttributeRole` (0..1)
- `reports` — array of `ReportRole` (0..*)
- `extensions` — optional record for module-defined role data

Display role is optional even for `LayerNode` (`LayerNodeRoles` extends `NodeRoles` with `display` still optional) — this supports placeholder nodes that appear in the tree before full configuration is loaded.

Source: `src/core/framework/types/domain/node/role.ts`

### TreeNode Hierarchy

```
TreeNodeBase (id, type, title, description, icon, parentId, bbox, roles, isVisible)
  ├── GroupNode   (childrenIds, childrenCount, isExtended)
  └── LayerNode   (roles: LayerNodeRoles)
```

`LayerTreeNodeTypes` enum: `Group = "GROUP"`, `Layer = "LAYER"`. Type guards: `isGroupNode()`, `isLayerNode()`.

Source: `src/core/framework/types/domain/node/tree.ts`

### RenderDescriptor

Immutable value object: `{ role, sourceUrl, config }`. Updates create new descriptors via spread — originals are never mutated. Pure functions: `makeRenderDescriptor()`, `updateDescriptorConfig()`, `isDescriptorRole()`.

Source: `src/core/framework/types/domain/layer/descriptor.ts`

## Cardinality Rules

| Role Category | Cardinality | Empty State |
|---------------|-------------|-------------|
| Display | 0..1 | Node appears in tree, no map layer |
| Attribute | 0..1 | No attribute table data |
| Reports | 0..* | Empty array `[]` |

Modules that receive multiple display or attribute candidates from their source MUST resolve to one before creating the NodeRoles.

## Extensibility

| Mechanism | Purpose |
|-----------|---------|
| `LayerRoles.of("name")` | Create custom layer roles |
| `NodeRoles.extensions` | Attach module-defined role data |
| `NodeRoleBase` (extended by AttributeRole, ReportRole) | Common fields for new role types |

## Trade-offs

- **`extensions` is untyped** (`Record<string, unknown>`) — modules lose type safety for custom roles. Trade-off: core knows nothing about module-specific roles; this is the escape hatch.
- **Display optional for LayerNode** — allows placeholder nodes but means every consumer must check `roles.display` before rendering. Mitigation: `isLayerNode()` does not guarantee display role presence.
