# Layer Tools — Design

## Context

Layer tools extend the portal's layer context menu. Each tool is a UI action available on tree nodes filtered by the node's display role. Tools are objects (no lifecycle), registered during app init, and rendered inside the node's "More" panel.

## Patterns

### Tool Object Pattern

Tools are plain objects — no class, no lifecycle. State is managed by the component internally via MobX reactions. See [extension-system](../extension-system/spec.md) for the Objects vs Classes decision rule and [extension-system](../extension-system/design.md) for the rationale.

Source: `src/core/framework/types/domain/layer/tool.ts`

### Role Resolution

`LayerToolRole` = single role | array of roles | `"all"`. At registration time, the `ToolStore` resolves `"all"` to every known role and registers the tool per-role. Array roles are registered for each element. Single role is registered as-is.

Source: `src/core/framework/store/layer/ToolStore.ts` — `resolveRoles()`

### Registration Flow

Layer tools are registered via explicit arrays in a dedicated `register*.ts` file. See [extension-system](../extension-system/spec.md) for the explicit registration pattern contract and [extension-system](../extension-system/design.md) for the initialization order rationale.

### Duplicate Prevention

Registration is idempotent: if a tool with the same `id` already exists for a role, the duplicate is silently skipped. First registration wins.

Source: `src/core/framework/store/layer/ToolStore.ts` — `registerTool()`

### Locale

Each tool provides translations via a `locale.ts` file and the `localeTranslations` field on the tool object. See [locale](../locale/spec.md) for the translation dictionary format, namespace convention, and fallback chain. See [locale](../locale/design.md) for the registration flow and reactive locale switching design.

Source: `src/core/framework/types/framework/locale.ts`

### Component Contract

The `component` factory receives `nodeId: string`. The component accesses the layer node via `rootStore.treeStore.getNode(nodeId)`, validates the node type and config, and renders controls that call `treeStore.updateLayerConfig()` on user interaction.

Source: `src/layer-tools/raster-opacity/components/Panel.tsx` (reference implementation)

### Directory Convention

```
src/layer-tools/<tool-name>/
├── index.ts              # Re-exports tool definition
├── locale.ts             # Translations
├── components/
│   ├── Tool.tsx          # LayerTool object definition
│   ├── Panel.tsx         # React component
│   └── Panel.module.css  # Styles (optional)
```

### Role Extensibility

Modules register new roles via `toolStore.registerRole(role, adapter, defaultConfig)`. This adds the role to the known-roles set and registers the adapter + default config. Tools with `role: "all"` automatically extend to new roles.

Source: `src/core/framework/store/layer/ToolStore.ts` — `registerRole()`

## Extension Points

| Extension Point | Mechanism | Used By |
|-----------------|-----------|---------|
| New layer tool | Add to `BUILT_IN_TOOLS` in `registerTools.ts` | Developers |
| New layer role | `toolStore.registerRole()` | Modules |
| Custom tool component | Implement `component(nodeId)` | Developers |

## Trade-offs

- **Flat registration**: All tools in one array — simple but doesn't support lazy loading. Trade-off accepted: current tool count is small.
- **Resolve-at-registration**: `"all"` tools expand to all known roles at registration time, not query time. New roles registered later require re-registration of `"all"` tools. Mitigation: roles are always registered before tools in the init order.
