## Context

Modules are the primary extension container — the orchestration layer through which domain-specific functionality reaches the portal. Core provides built-in infrastructure (generic widgets, layer tools, map tools, adapters). All domain-specific functionality — new data sources, custom layer roles, specialized widgets and tools — is delivered as modules. This is the last extension type spec to be migrated.

## Goals / Non-Goals

**Goals:**
- Document the Module interface and the setRootStore→register lifecycle
- Document SourceAdapter as the data source contract
- Document custom role registration via layerToolStore.registerRole()
- Document the init order guarantees (modules last)
- Document Core↔Module boundary (one-directional through registration interfaces)
- Reference extension-system, node-roles, layer-system, settings, and locale specs

**Non-Goals:**
- Specifying the internal implementation of individual modules (STAC, etc.)
- Changing any runtime module behavior
- Specifying how individual SourceAdapters map data formats to roles

## Decisions

### Module as class or object

Modules follow the Objects vs Classes rule from `extension-system`. A module with state (config, cached data) uses a class. A stateless module uses an object.

**Why classes for data modules**: Data source modules typically hold config and a RootStore reference. A class provides a natural place for `setRootStore(rootStore)` and `register(config?)` with typed state.

**Stateful module pattern**:
```ts
export class MyModule implements Module<MyConfig> {
    readonly id = "my-module";
    readonly name = "My Module";
    private rootStore: RootStore | null = null;
    private config: MyConfig | null = null;

    setRootStore(rootStore: RootStore): void { this.rootStore = rootStore; }

    async register(config?: MyConfig): Promise<void> {
        this.config = config ?? { /* defaults */ };
        const adapter = new MyAdapter(this.rootStore!, this.config);
        await this.rootStore!.sourceAdapterFactory.register("my-source", adapter);
    }
}
```

Source: `src/core/framework/types/framework/module.ts`

### setRootStore before register — two-phase init

Module initialization is two-phase:
1. `setRootStore(rootStore)` — synchronous, called first
2. `register(config?)` — async, called second

**Why**: Separating store injection from registration prevents a timing problem. If `register(rootStore, config)` combined both, the module couldn't access stores during registration if they were passed as a parameter. With `setRootStore` called first, `this.rootStore` is guaranteed non-null during `register()`.

Source: `src/core/framework/store/root/rootStore.ts` — `initialize()`

### SourceAdapter — external data to TreeNode translation

`SourceAdapter` converts external data formats into `TreeNode[]` with `NodeRoles`. Core knows nothing about STAC, GeoJSON, WMS — the module's mapping layer handles all translation.

**Why**: The portal is data-source-agnostic. A module for STAC catalogs, one for OGC API Features, and one for custom REST APIs all produce the same `TreeNode[]` output. Core only sees the result, never the source format.

**Mapping responsibility**: The module resolves ambiguity at parse time. If a data source provides multiple display candidates, the module picks one. Core expects at most one display role per node.

Source: `src/core/framework/types/domain/source/adapter.ts`, `src/modules/stac/mapping/`

### Custom role registration via layerToolStore

`layerToolStore.registerRole(role, adapter, defaultConfigFactory)` bundles three operations into one call:
1. Adds the role to the known-roles set (for tool discovery)
2. Registers the adapter in `layerAdapterFactory` (for rendering)
3. Registers a default config factory in `layerConfigRegistry` (for config creation)

**Why bundled**: These three operations must happen atomically. A role registered in the tool system but missing an adapter would produce nodes with no rendering path. A single call prevents partial registration.

**TypeScript integration**: Modules extend `LayerConfigRegistry` via declaration merging to type the custom config:
```ts
declare module "@core/framework/types" {
    interface LayerConfigRegistry { "my-role": MyRoleConfig; }
}
```

Source: `src/core/framework/store/layer/ToolStore.ts` — `registerRole()`

### Modules are registered last

The init order places modules after all built-in registrations:

```
1. registerLayerAdapters()
2. registerAttributeAdapters()
3. registerBuiltInWidgets()
4. registerTools()
5. registerMapTools()
6. registerModules()        ← modules here
7. fetchLayerTree()
8. markInitialized()
```

**Why**: Modules may register extensions of any type (widgets, tools, custom roles). They need all built-in registries to be populated. `fetchLayerTree()` is after modules because it depends on source adapters registered by modules.

Source: `src/core/framework/store/root/rootStore.ts`

### Core↔Module boundary is one-directional

```
Core ──→ exposes registration interfaces (stores, factories)
Modules ──→ call registration methods

Core NEVER imports from modules
```

The only contact point is `registerModules()` imported in `RootStore`. This function iterates the module array and calls `setRootStore()` then `register()` on each — it's the registration entry point, not a module implementation.

Source: `src/modules/registerModules.ts`

## Directory Layout

```
src/modules/<module-name>/
├── index.ts                  # Module export (singleton)
├── module/
│   └── <Module>Module.ts     # Class implementing Module
├── adapter/                  # SourceAdapter (if data source)
│   └── <Module>TreeAdapter.ts
├── core/                     # Internal logic (client, cache, mapper)
├── mapping/                  # External data → NodeRole[] + TreeNode
├── types.ts                  # External data types
└── config.json               # Default config
```

## Risks / Trade-offs

- **No module dependency management**: Modules can't declare dependencies on other modules. If module B depends on source adapter registered by module A, and A fails, B silently gets no data. Trade-off: simpler model; no dependency resolution needed.
- **Module registrations are fire-and-forget**: The system doesn't track which extensions a module registered, so there's no automatic cleanup on module unload. Trade-off: module unloading is not a current use case.
- **No lazy module loading**: All modules are registered at init. Trade-off: acceptable because module count is small and module registration is cheap.
