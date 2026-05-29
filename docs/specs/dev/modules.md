# How to Add a Module

## Interface

`Module<TConfig>` — registration contract. Optional: `setRootStore()`.

See: [`src/core/framework/types/framework/module.ts`](../../../src/core/framework/types/framework/module.ts)

A module can contain **anything**: data sources, widgets, tools, map tools. There are no restrictions beyond the `Module` interface.

For data source modules, register a `SourceAdapter` with the `rootStore.sourceAdapterFactory`:

```ts
import type { RootStore } from "@core/framework/store";
import { type Module } from "@core/framework/types";
import { MyTreeAdapter } from "./adapter/MyTreeAdapter";

class MyModule implements Module {
    readonly id = "my-module";
    readonly name = "My Data Module";

    private rootStore: RootStore | null = null;

    setRootStore(rootStore: RootStore): void {
        this.rootStore = rootStore;
    }

    async register(): Promise<void> {
        const adapter = new MyTreeAdapter();
        await this.rootStore!.sourceAdapterFactory.register("my-module", adapter);
    }
}
```

For modules that add a **custom layer role**:

Custom roles are registered via `layerToolStore.registerRole()` rather than directly through `layerAdapterFactory` because the role needs to be wired into three places at once: config registry (for default config), adapter factory (for rendering), and the known-role set (for tool discovery — tools with `role: "all"` must find it). `registerRole()` bundles all three steps into one call, keeping the registration surface minimal.

```ts
// my-role/types.ts
import type { LayerConfigBase } from "@core/framework/types";

export interface MyRoleLayerConfig extends LayerConfigBase {
    customParam: string;
}

// Extend the type registry so LayerConfigFor works for your role
declare module "@core/framework/types" {
    interface LayerConfigRegistry {
        "my-role": MyRoleLayerConfig;
    }
}
```

```ts
// adapter/MyRoleAdapter.ts
// Implement LayerAdapter<typeof LayerRoles.RASTER> — the generic
// parameter narrows addToMap's descriptor.config to your config type.
```

```ts
// my-module/module/MyModule.ts
import { type Module, LayerRoles } from "@core/framework/types";
import type { RootStore } from "@core/framework/store";

class MyModule implements Module {
    readonly id = "my-module";
    readonly name = "My Module";

    private rootStore: RootStore | null = null;

    setRootStore(rootStore: RootStore): void {
        this.rootStore = rootStore;
    }

    async register(): Promise<void> {
        const role = LayerRoles.of("my-custom-role");
        await this.rootStore!.layerToolStore.registerRole(
            role,
            new MyRoleAdapter(),
            () => ({ role, url: "", customParam: "default" }),
        );
    }
}
```

`layerToolStore.registerRole()` is the registration point because **roles are mapped to tools** — the same store that knows about layer-specific actions (`LayerTool`) also knows about available render roles. This keeps role registration and tool lookup in one place, avoiding a separate registry just for role discovery.

See: [`src/core/domain/adapters/source/SourceAdapterFactory.ts`](../../../src/core/domain/adapters/source/SourceAdapterFactory.ts)

---

## Step-by-Step

### 1. Create directory

```
src/modules/<module-name>/
├── index.ts                  # Module export (singleton)
├── module/
│   └── <Module>Module.ts     # Class implementing Module (+ optional interfaces)
├── adapter/                  # SourceAdapter (if data source)
│   └── <Module>TreeAdapter.ts
├── core/                     # Internal logic (client, cache, mapper)
├── mapping/                  # Maps external data → NodeRole[] + TreeNode
├── types.ts                  # External data types
└── config.json               # Default config
```

### 2. Define the module class

Module is a **class if it has state**, an **object if stateless** (see [extending.md](./extending.md) — Objects vs Classes).

```ts
import { type Module, type RootStore } from "@core/types";
import type { MyModuleConfig } from "./core/MyModuleConfig";
import { MyTreeAdapter } from "./adapter/MyTreeAdapter";

export class MyModule implements Module<MyModuleConfig> {
    readonly id = "my-module";
    readonly name = "My Data Module";

    private config: MyModuleConfig | null = null;
    private rootStore: RootStore | null = null;

    setRootStore(rootStore: RootStore): void {
        this.rootStore = rootStore;
    }

    async register(config?: MyModuleConfig): Promise<void> {
        this.config = config ?? { /* defaults */ };
        const adapter = new MyTreeAdapter(config);
        await this.rootStore!.sourceAdapterFactory.register("my-module-source", adapter);
        // Optionally register widgets or tools
        this.rootStore!.catalogStore.registerWidget(MyWidget);
    }
}

export const myModule = new MyModule();
```

### 3. Implement SourceAdapter (if data source)

`SourceAdapter` converts external data into `TreeNode[]` with `NodeRole[]`. Core knows nothing about the external format.

See: [`src/core/framework/types/domain/source/adapter.ts`](../../../src/core/framework/types/domain/source/adapter.ts)

### 4. Register

Add to the modules array in [`src/modules/registerModules.ts`](../../../src/modules/registerModules.ts)

---

## Initialization Order

Modules are registered **last**, right before `fetchLayerTree()`:

```
1. registerLayerAdapters()        ← Core layer adapters (Raster, Vector, etc.)
2. registerAttributeAdapters()    ← Attribute adapters (WFS, etc.)
3. registerBuiltInWidgets()       ← Built-in widgets
4. registerTools()                ← Built-in layer tools
5. registerMapTools()             ← Built-in map tools
6. registerModules()              ← Modules (modules receive rootStore via setRootStore() before register())
7. fetchLayerTree()               ← Load tree (needs all sources registered)
8. markInitialized()              ← UI renders
```

**Important lifecycle order**:
1. `module.setRootStore(rootStore)` is called **first** — synchronously
2. `module.register()` is called **second** — asynchronously

This guarantees modules have access to `rootStore` during `register()`.

---

## NodeRole Mapping

Every `SourceAdapter` returns `TreeNode[]` where each node has `roles: NodeRoles`. The module is responsible for mapping its data format into roles:

| Category | Purpose |
|----------|---------|
| `display` | Render descriptor for rendering on map |
| `attribute` | Endpoint for attribute data |
| `report` | Download link for reports |

Core does **not** know about the external format (STAC, GeoJSON, etc.). The module's mapper handles all translation.

See: [`src/modules/stac/mapping/`](../../../src/modules/stac/mapping/)

---

## Related

- [extending.md](./extending.md) — General extension guide
- [state-management.md](../domain/state-management.md) — RootStore access pattern
