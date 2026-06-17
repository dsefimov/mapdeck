# View Attribute Table — Design

## Context

Navigates from a layer's context menu to the attribute table widget, scoped to that specific layer. Available for all layer types. The action itself is always visible; the component renders nothing if the node has no attribute role.

## Patterns

### Conditional Render Pattern

The tool is registered for all roles — it appears for every layer type. The component checks for the presence of an attribute capability on the node. When absent, the component returns `null` — the tool entry remains in the menu but produces no content. The decision to render or not is made by the component, not the menu infrastructure.

Source: `src/layer-tools/view-attribute-table/components/Tool.tsx`

### Widget Scoping

On click, the component signals the widget system to open the attribute table widget with the current node identity as scope. The widget reads the node's attribute capability and fetches data via the attribute data store.

Source: `src/layer-tools/view-attribute-table/components/Panel.tsx`

### Locale

Namespace: `"view-attribute-table"`. Keys: `tool.name`, `label.button`, `aria.button`.

Source: `src/layer-tools/view-attribute-table/locale.ts`

## Extension Points

| Extension Point | Mechanism |
|-----------------|-----------|
| Custom attribute sources | Register new attribute data adapter types via the adapter factory |
| Alternative attribute widgets | Replace the widget ID in the tool's click handler |

## Trade-offs

- **Always visible, sometimes empty** — the tool entry is shown even when the node has no attribute data. This avoids menu flicker as nodes load their roles asynchronously. Trade-off: users occasionally click a non-functional action.
- **Single widget instance** — only one attribute table widget can be open at a time. Opening a second layer's data replaces the first. Trade-off: simpler state management but no side-by-side comparison.

## Directory

```
src/layer-tools/view-attribute-table/
├── index.ts
├── locale.ts
└── components/
    ├── Tool.tsx
    ├── Panel.tsx
    └── Panel.module.css
```
