# How to Extend Mapdeck

## 1. Choose Your Layer

Before writing code, identify which layer your feature belongs to:

| You want to… | Layer | Read |
|---|---|---|
| Add a UI panel or view | **Widget** | [`widgets.md`](./widgets.md) |
| Add a control to a layer's "More" menu | **LayerTool** | [`tools.md`](./tools.md) |
| Add a map interaction (measure, basemap, etc.) | **MapTool** | [`map-tools.md`](./map-tools.md) |
| Connect an external data source (STAC, GeoJSON, etc.) | **Module** | [`modules.md`](./modules.md) |
| Change page routing or layout | **App** | [`routing.md`](./routing.md) |

**Rule**: Widgets, Tools, MapTools, and Modules depend on **Core only**. They must not import from each other.

---

## 2. Registration Principle

All extensions are registered **explicitly** in dedicated `register*.ts` files during app initialization via `RootStore.initialize()`.

### How it works

```ts
RootStore.initialize()
  └─ registerLayerAdapters()
  └─ registerAttributeAdapters()  ← src/core/domain/adapters/attribute/registerAttributeAdapters.ts
  └─ registerBuiltInWidgets()   ← src/widgets/registerWidgets.ts
  └─ registerTools()            ← src/layer-tools/registerTools.ts
  └─ registerMapTools()         ← src/map-tools/registerMapTools.ts
  └─ registerModules()          ← src/modules/registerModules.ts
  └─ fetchLayerTree()
  └─ markInitialized()
```

Each `register*.ts` file contains an **explicit list** of extensions:

```ts
// src/layer-tools/registerTools.ts
const BUILT_IN_TOOLS = [
    rasterOpacityTool,
    pointSizeTool,
    // add new tools here
];

export async function registerTools(rootStore: RootStore): Promise<void> {
    for (const tool of BUILT_IN_TOOLS) {
        rootStore.layerToolStore.registerTool(tool);
    }
}
```

### Why explicit registration

- **Visibility**: all registered extensions are visible in one file
- **Order**: initialization order is deterministic
- **No silent failures**: forgetting an import won't silently skip registration
- **No tree-shaking risk**: bundlers won't drop unused side-effect imports

### How to add a new extension

1. Define the extension (object or class) in its own directory
2. Import it in the corresponding `register*.ts` file
3. Add it to the explicit list
4. Done — no other files need changes

---

## 3. Objects vs Classes

Mapdeck uses two patterns for defining extensions. Choose based on **state and lifecycle**.

### Use an **object** when:

- The extension is **stateless** — only metadata + a React component
- No lifecycle methods beyond a simple `component(nodeId)` factory
- No cleanup needed on removal

**Examples**: `Widget`, `LayerTool`

```ts
export const rasterOpacityTool: LayerTool = {
    id: "raster-opacity-slider",
    role: LayerRole.RASTER,
    component: (nodeId: string) =>
        React.createElement(RasterOpacitySlider, { nodeId }),
};
```

### Use a **class** when:

- The extension has **state** (`isActive`, cached data, event listeners)
- It has a **lifecycle** (`activate` / `deactivate`, `dispose`)
- It needs to **clean up** resources on removal

**Examples**: `MapTool`, `Module`, `SourceAdapter`

```ts
export class ResetOrientationTool implements MapTool {
    readonly id = "reset-orientation";
    get isActive(): boolean { return false; }

    activate(_map: maplibregl.Map): void {}
    deactivate(): void {}
    execute(rootStore: RootStore): void { /* ... */ }
}
```

### Decision rule

> **No state, no lifecycle → object.**
> **Has state or lifecycle → class.**

### Global services (via RootStore)

Global services (factories, managers) live in `RootStore` and are accessed through it:

```ts
rootStore.layerAdapterFactory       // LayerAdapter registry
rootStore.sourceAdapterFactory      // SourceAdapter registry
rootStore.attributeAdapterFactory   // AttributeAdapter registry
rootStore.mapStore.overlayManager   // Deck.gl overlay manager
```

See [modules.md](./modules.md) for an example of registering a custom layer role.

---

## 4. Next Steps

Once you've identified your layer and pattern, read the detailed spec:

- [`widgets.md`](./widgets.md) — Widget interface, size constraints, registration
- [`tools.md`](./tools.md) — LayerTool interface, LayerRole binding, registration
- [`map-tools.md`](./map-tools.md) — MapTool interface, activate/deactivate, settings
- [`modules.md`](./modules.md) — Module + DataSourceModule, SourceAdapter, NodeRole[]
