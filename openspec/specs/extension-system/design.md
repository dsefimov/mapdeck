## Context

The portal is a geospatial constructor: developers build domain-specific applications by combining reusable extensions. Four extension types exist, each serving a distinct purpose. Currently, the rules governing how extensions are defined, registered, and initialized are duplicated across multiple docs (`extending.md`, `widgets.md`, `map-tools.md`, `modules.md`). This design consolidates them into a single contract.

The extension system sits at the boundary between Core and the four extension layers (Widgets, LayerTools, MapTools, Modules). Every extension developer must understand these rules before creating any extension.

## Goals / Non-Goals

**Goals:**
- Define the four extension types and their distinguishing characteristics
- Document the explicit registration pattern and initialization order
- Codify the Objects vs Classes decision rule
- Document RootStore as the single access point for extensions
- Provide source file references for every concept

**Non-Goals:**
- Changing any runtime behavior or registration code
- Specifying individual extension interfaces in detail (delegated to type-specific specs: `widgets`, `map-tools`, `modules`)
- Specifying how layer tools resolve role bindings (already covered by `layer-tools` spec)
- Specifying how modules map external data to NodeRoles (already covered by `node-roles` spec)

## Extension Type Architecture

```
                      ┌─────────────────────────────────┐
                      │           Core (built-in)         │
                      │  Built-in widgets, layer tools,   │
                      │  map tools, layer adapters        │
                      └───────────────┬───────────────────┘
                                      │ registers into
                                      ▼
                      ┌─────────────────────────────────┐
                      │    Registration Interfaces       │
                      │  catalogStore | layerToolStore   │
                      │  mapToolStore | adapterFactory   │
                      └───────────────┬───────────────────┘
                                      │ used by
                                      ▼
                      ┌─────────────────────────────────┐
                      │           Module                 │
                      │  (primary extension container)   │
                      │                                  │
                      │  ┌──────┐ ┌────────┐ ┌───────┐  │
                      │  │Widget│ │MapTool │ │Source │  │
                      │  │      │ │        │ │Adapter│  │
                      │  └──────┘ └────────┘ └───────┘  │
                      │  ┌──────────┐ ┌──────────────┐  │
                      │  │LayerTool │ │Custom roles  │  │
                      │  └──────────┘ └──────────────┘  │
                      └─────────────────────────────────┘

  Core ← never imports from modules
  Modules ← use Core's registration interfaces exclusively
```

## Decisions

### Four extension types, not a unified interface

The portal has four extension types rather than a single `Extension` interface with a `type` discriminator. Each type has fundamentally different lifecycle and registration needs:

- **Widget**: No state, no lifecycle beyond the component. Registered as a sidebar button, rendered as a floating panel.
- **LayerTool**: No state, no lifecycle. Scoped by layer role. Rendered in context menu.
- **MapTool**: Has state (`isActive`), lifecycle (`activate`/`deactivate`), may own event listeners and MobX-observable fields.
- **Module**: Has lifecycle (`setRootStore` → `register`), may register its own extensions, may provide data sources.

**Alternatives considered**: Single `Extension` interface with `type` field — rejected because each type has different registration stores and lifecycle hooks. The current approach keeps type-specific stores self-contained.

### Module as the primary extension container

Modules are not just "one of four" extension types — they are the **orchestration layer** through which the other three types reach the portal. Core provides built-in infrastructure (generic layer tools, basic widgets, built-in adapters). All domain-specific functionality is delivered as modules.

A module receives `RootStore` injection, then during `register()` it may:
- Register a `SourceAdapter` for fetching external data
- Register custom layer roles via `layerToolStore.registerRole()`
- Register widgets, layer tools, and map tools via the appropriate stores
- Perform any async initialization its adapters need

**Why modules, not direct registration**: Keeping domain logic in modules provides a clean boundary. Core never imports from `src/modules/`. This prevents core from accidentally depending on domain-specific code, keeps the built-in set small and generic, and allows modules to be developed, tested, and versioned independently.

**Core ↔ Module boundary**: Communication is one-directional through registration interfaces (stores and factories). Core exposes registration methods; modules call them. Core never reaches into module internals.

### Object for stateless, class for stateful

Two implementation patterns exist, differentiated by state and lifecycle:

| Pattern | When | Examples | Key trait |
|---------|------|----------|-----------|
| Plain object | No mutable state, no lifecycle beyond creation | Widget, LayerTool | Just metadata + component factory |
| Class | Has observable state, lifecycle, or cleanup | MapTool, Module, SourceAdapter | MobX `observable` fields, `activate`/`deactivate` |

**Alternatives considered**: Classes everywhere — rejected because LayerTools and Widgets have no state to encapsulate; a class wrapping only static metadata adds boilerplate with no benefit. Objects everywhere — rejected because MapTools need `observable` fields and lifecycle; MobX `makeObservable` works on class instances, not plain objects.

### Explicit registration over auto-discovery

Every extension is listed explicitly in a `register*.ts` file. No `import.meta.glob`, no filesystem scanning, no decorators.

**Why**: Auto-discovery (e.g., scanning `src/widgets/` for all files) has three failure modes the project explicitly avoids:
1. **Tree-shaking risk**: Bundlers may drop files not statically imported.
2. **Silent skip**: Forgetting an export means the extension silently vanishes.
3. **Init order**: Implicit discovery makes order non-deterministic.

**Alternatives considered**: Vite's `import.meta.glob` — rejected because it couples registration to filesystem layout and makes order implicit. Decorator-based registration — rejected because it requires experimental TypeScript features and makes registration side-effects implicit.

Source: `src/widgets/registerWidgets.ts`, `src/layer-tools/registerTools.ts`, `src/map-tools/registerMapTools.ts`, `src/modules/registerModules.ts`

### Registration via type-specific stores

Each extension type has its own registration store and method:

| Extension Type | Store | Registration Method |
|---------------|-------|-------------------|
| Widget | `WidgetCatalogStore` | `registerWidget(widget)` |
| LayerTool | `ToolStore` (`layerToolStore`) | `registerTool(tool)` |
| MapTool | `MapToolStore` | `registerTool(tool)` |
| Module | Direct call | `module.register()` (module manages its own registration) |

**Why separate stores**: Each store has type-specific logic — `ToolStore` resolves role bindings, `WidgetCatalogStore` manages sidebar visibility and sizing, `MapToolStore` manages activation state. A single registry would need internal branching by type.

### Deterministic initialization order

The order is fixed and enforced by `RootStore.initialize()`:

```
1. registerLayerAdapters()       ← Core adapters (Raster, Vector, PointCloud)
2. registerAttributeAdapters()   ← WFS adapter
3. registerBuiltInWidgets()      ← Built-in widgets
4. registerTools()               ← Built-in layer tools
5. registerMapTools()            ← Built-in map tools
6. registerModules()             ← External modules (receives full RootStore)
7. fetchLayerTree()              ← Load layer tree
8. markInitialized()             ← UI renders
```

**Why this order**: Modules are last because they may register extensions of any type (widgets, tools, map tools, custom roles). They need all built-in registries to be populated first. `fetchLayerTree()` is last because it depends on source adapters registered by modules.

**`setRootStore` before `register`**: Each module receives `rootStore` via synchronous `setRootStore()` before its async `register()` is called. This guarantees modules can access any store during registration.

Source: `src/core/framework/store/root/rootStore.ts`

### RootStore as service locator

Components access stores via `useRootStore()` hook. Stores receive RootStore via constructor injection. This is a deliberate service locator pattern rather than React Context for each store.

**Why**: The project has 10+ stores. Individual React Context providers would create deep nesting and make the component tree harder to read. A single RootStore context keeps the tree flat and makes store access consistent.

**Store-to-store access**: Stores depend on RootStore, never on each other directly. Cross-store access goes through `rootStore.otherStore`. This prevents circular dependencies and makes the dependency graph explicit in RootStore's constructor.

Source: `src/core/framework/store/root/rootStore.ts`

### Idempotent registration

Duplicate registration of the same extension id is silently ignored — the first registration wins. No error is surfaced.

**Why**: Modules may attempt to register extensions that were already registered by other modules. Silent ignore prevents brittle ordering dependencies between modules. The alternative (throwing on duplicate) would force modules to check for pre-existence, which is error-prone.

**Exception**: Layer tools use role-scoped deduplication — same id for different roles is allowed, same id for same role is deduplicated. See `layer-tools` spec.

## Directory Convention

Each extension type has a dedicated directory under `src/`:

```
src/
├── widgets/<widget-name>/    ← Widget implementations
├── layer-tools/<tool-name>/  ← LayerTool implementations
├── map-tools/<tool-name>/    ← MapTool implementations
└── modules/<module-name>/    ← Module implementations
```

Each extension directory contains:
- `index.ts` — public API barrel
- `locale.ts` — translations (optional)
- Type-specific files (components, stores, utils)

## Risks / Trade-offs

- **No lazy registration**: All extensions are registered at init time, even those never used. Trade-off: simpler init logic, but memory grows with extension count. Mitigation: current extension count is small; revisit if count exceeds 50+.
- **Flat registration arrays**: All extensions of a type are in one file. Trade-off: merge conflicts when multiple developers add extensions simultaneously. Mitigation: convention of appending to the end of the array.
- **RootStore as service locator**: Every store can access every other store. Trade-off: risk of spaghetti dependencies if stores access each other freely. Mitigation: AGENTS.md rule that stores depend on RootStore, never on each other directly; code review catches violations.
- **Module registrations are fire-and-forget**: The system doesn't track which extensions a module registered, so there's no automatic cleanup on module unload. Trade-off: simpler lifecycle; module unloading is not a current use case.
