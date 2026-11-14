# Extending mapdeck

This guide shows how to add modules and extensions to an embedded Mapdeck instance.
Architecture decisions are recorded in `docs/adr/`. The complete extension contract,
including context members, registration policy and public types, is documented in
[docs/api/extensions.md](api/extensions.md). This guide focuses on integration examples.

## Package entry points

| Entry | What it is for |
|---|---|
| `mapdeck` | `createMapdeck(options)`, `MapdeckRoot`, module/extension types, `createToolPanelWidget` |
| `mapdeck/contracts` | the full contract barrel: ports (`OverlayManager`, `MapContext`), registration surfaces, asset-mapping types, point-cloud picking |
| `mapdeck/ui` | the panel-building surface: primitives, inputs, `ToolPanel`/`SegmentsList`/`DataTable`/`ColorPicker`, interaction hooks, theme helpers |
| `mapdeck/utils` | pure helpers: geo formatters |
| `mapdeck/styles.css` | the stylesheet with the design tokens — one file styles built-ins and extensions alike |

## Source adapters and protocols

A source adapter and a protocol have separate responsibilities:

- a **source adapter** discovers a source's content (a STAC catalog) and builds the
  layer tree: groups, layers, bindings, capabilities;
- a **protocol** defines how one node's data is requested and rendered (raster
  tiles, GeoJSON, a point cloud).

A module may register either or both. The built-in STAC adapter and the supported
built-in protocols are described in [docs/api/protocols.md](api/protocols.md).

## End-to-end walkthrough

A complete module: a translation namespace, a setting, an interactive map tool with
its panel — registered, embedded, and cleaned up.

```tsx
// host/App.tsx
import ReactDOM from "react-dom/client";
import { createMapdeck, MapdeckRoot, createToolPanelWidget } from "mapdeck";
import type { Module, MapTool } from "mapdeck";
import type { MapToolComponentProps } from "mapdeck/contracts";
import { ToolPanel } from "mapdeck/ui";

// 1. The tool's panel — a plain component over the tool context.
function DistancePanel({ context }: MapToolComponentProps) {
    const precision = context.settings.getNumberSetting("precision") ?? 2;
    return <ToolPanel title="Distance">Precision: {precision}</ToolPanel>;
}

// 2. The tool and the module that carries it.
const distanceTool: MapTool = {
    kind: "interactive",
    id: "my-distance",
    icon: "ruler",
    component: DistancePanel,
    localeTranslations: {
        en: { "tool.name": "Distance" }, // en is the fallback language; register it
        ru: { "tool.name": "Замер" },
    },
};

export const myModule: Module = {
    id: "my-tools",
    name: "My tools",
    register(context) {
        // 3. Translations under the tool's id (its locale namespace).
        context.locale.registerTranslations(distanceTool.id, distanceTool.localeTranslations!);
        // 4. A setting the tool reads at runtime.
        context.settings.registerSettings("my-distance", "Distance", [
            { id: "precision", label: "Precision", type: "number", defaultValue: 2, min: 0, max: 6 },
        ]);
        // 5. The tool and its panel widget.
        context.mapTools.registerTool(distanceTool);
        context.widgets.registerWidget(createToolPanelWidget(distanceTool));
    },
};

// 6. Embed with the module; render; dispose when the embed goes away.
const mapdeck = createMapdeck({
    modules: [myModule],
    settingsOverrides: { "layer-tree.data-source-url": "https://example.com/stac/catalog.json" },
});
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<MapdeckRoot mapdeck={mapdeck} />);
// later: root.unmount(); mapdeck.dispose();
```

`register` may be synchronous or async (bootstrap awaits it). Everything registered
through the context is released with the instance — there is no module unload hook;
see [Cleanup and ownership](api/extensions.md#cleanup-and-ownership).

## A map tool with a panel

The walkthrough above is the complete recipe. Key integration details:

- A panel receives `{ context, map, overlayManager, deactivate }`. `map` is the raw
  MapLibre instance — the documented platform-technology exception (ADR-0006);
  `context` is the runtime slice (`ToolRuntimeContext`); `deactivate` closes the
  panel.
- Register the panel yourself with `createToolPanelWidget(tool)`; the panel renders
  only while its tool is active, outside the widget grid.
- Action tools (`kind: "action"`) carry `execute({ context, map })` instead of a
  component and need no widget registration.
- Build the UI from `mapdeck/ui`: a token override in the host restyles it together
  with the built-ins.
- **MapLibre types**: `mapdeck/contracts` references `maplibregl.Map` inline but
  does not re-export it, and the engines are not peers of `mapdeck`. Install
  `maplibre-gl@^5` as your own (dev) dependency for the types, and at runtime work
  through the `map` instance the context hands you; a module that instantiates
  engine classes imports its own engine copy and owns the duplication cost
  ([api/extensions.md](api/extensions.md#maplibre-and-deckgl-types)).

## A layer tool

```tsx
import type { Module } from "mapdeck";
import type { ReactNode } from "react";
import { ToolPanel } from "mapdeck/ui";

// Registration snippet. The component factory's only input is the node id
// of the layer whose menu opened.
function MyLayerTool(nodeId: string): ReactNode {
    return <ToolPanel title="My tool">Node {nodeId}</ToolPanel>;
}

export const layerToolModule: Module = {
    id: "my-layer-tools",
    name: "My layer tools",
    register(context) {
        context.layerTools.registerTool({
            id: "my-layer-tool",
            component: MyLayerTool,
        });
        context.layerTools.bindToolToProtocol("my-protocol", "renderer", "my-layer-tool");
    },
};
```

The binding is what makes the tool available on nodes of that protocol — the same
link mechanism the built-ins use. The tool still appears only on nodes whose source
assigned the capability (ADR-0007/0009); a source built on the built-in STAC
adapter assigns capabilities for registered links automatically.

The factory receives only the node id. Reading and writing the node's state from
the component — as the built-in opacity slider does — requires tree access that is
not yet a public port; the built-ins reach it as library-internal code. A public
node-state path for layer tools would be a new declared point of the context
family (ADR-0004).

## A protocol

A protocol names how a source renders. Register it with its asset-mapping
declaration — slot fitness (which node slots it serves and how well) and matching
rules (which assets it claims) can be registered with the protocol in one call:

```ts
import type { Module } from "mapdeck";
import type { LayerAdapter, Protocol, SourceAsset } from "mapdeck/contracts";

/** Protocol-specific config — the C in Protocol<C>. The index signature lets it
 * satisfy the registry's Record<string, unknown> config type. */
interface TerrainConfig {
    readonly opacity: number;
    [key: string]: unknown;
}

/** The adapter draws the format on the map — here native MapLibre raster tiles. */
const terrainAdapter: LayerAdapter<TerrainConfig> = {
    // native MapLibre layers follow the tree's z-order
    nativeLayerOrdering: true,
    addToMap(layerId, { sourceUrl, config }, ctx) {
        ctx.map.addSource(layerId, {
            type: "raster",
            tiles: [sourceUrl],
            tileSize: 256,
        });
        ctx.map.addLayer({
            id: layerId,
            type: "raster",
            source: layerId,
            paint: { "raster-opacity": config.opacity },
        });
    },
    removeFromMap(layerId, ctx) {
        ctx.map.removeLayer(layerId);
        ctx.map.removeSource(layerId);
    },
    updateVisibility(layerId, visible, ctx) {
        ctx.map.setLayoutProperty(
            layerId,
            "visibility",
            visible ? "visible" : "none",
        );
    },
    updateConfig(renderUnit, ctx) {
        // this format has no in-place update — rebuild
        this.removeFromMap(renderUnit.id, ctx);
        this.addToMap(renderUnit.id, renderUnit.descriptor, ctx);
    },
};

const terrainProtocol: Protocol<TerrainConfig> = {
    id: "my-terrain",
    label: "Terrain",
    defaultStyle: { paint: { "raster-opacity": 1 } },
    createRenderDescriptor(sourceUrl, style = {}) {
        // node style merged over the protocol default
        const paint = { ...terrainProtocol.defaultStyle.paint, ...style.paint };
        const opacity =
            typeof paint["raster-opacity"] === "number"
                ? paint["raster-opacity"]
                : 1;
        return { sourceUrl, config: { opacity } };
    },
    getLayerAdapter: () => terrainAdapter,
};

export const terrainModule: Module = {
    id: "my-terrain",
    name: "Terrain",
    register(context) {
        context.protocols.register(terrainProtocol, undefined, {
            slots: { renderer: 90 },
            rules: [
                {
                    priority: 5, // lower numbers claim an asset first
                    canResolve: (asset: SourceAsset) =>
                        asset.roles?.includes("terrain") ?? false,
                    resolve: (asset) => ({
                        protocolId: terrainProtocol.id,
                        sourceUrl: asset.href,
                        params: {},
                    }),
                },
            ],
        });
    },
};
```

Adapters support two rendering paths: native MapLibre layers
(`nativeLayerOrdering: true`) and overlay layers that draw through
`ctx.overlayManager` (deck.gl) — the same two integration paths used by the
built-in adapters ([api/extensions.md](api/extensions.md#protocol-and-layeradapter)).
`ctx.map` in the adapter is the MapLibre instance; type it with your own
`maplibre-gl@^5` dependency.

Assets come from the source adapter (the built-in STAC tree maps item assets
through the same asset mapper), so a protocol registered this way receives nodes
with no source-specific import. The lower-level path —
`context.assetMapping.registerRule(...)` and
`context.assetMapping.registerSlots(id, slots)` — remains valid when the rules or
slots register separately from the protocol.

The code examples on this page are compiled against the published package (a clean
consumer project installing the packed tarball, strict TypeScript) as part of the
release checks — they typecheck as shown.

The built-in protocols in `src/core/domain/protocols/` are further reference
implementations; they are repository source code, not part of the npm package.

## Settings, locale, basemaps

- `context.settings.registerSettings(ownerId, ownerName, metadata[], opts?)` —
  values initialize to their defaults; a re-declaration follows the owner's
  explicit-override policy (see [api/configuration.md](api/configuration.md)). Per-
  deployment *values* travel through the `settingsOverrides` embed option.
- Tool panels read current values through the runtime slice:
  `context.settings.getNumberSetting(id)` — likewise `getStringSetting` (string,
  select and color settings) / `getBooleanSetting` — returning the value at call
  time, or `undefined` for an unknown id or a type mismatch. Setting ids are
  unique across owners, so the bare id (`"precision"` in the walkthrough) is the
  read key. There is no change subscription: re-read after a value changes.
- `context.locale.registerTranslations(namespace, { ru: {...} })` — resolution: the
  current language's dictionary for the namespace, or the whole English dictionary
  when that language has no registration. There is no per-key merge across
  languages, so register `en` for every namespace.
- `context.basemap.registerConfigs([...])` — basemap configs; a built-in may be
  replaced by id with `{ override: true }`.

## Icons

Registry names (`isIconName`) render built-in artwork. Any other `[\w-]+` name
renders the `--icon-<name>` CSS token — define it on your container and make sure
the icon URL is reachable under the host's CSP:

```css
.mapdeck-root { --icon-terrain: url("terrain.svg"); }
```

No registry change is needed.

## Attribute value renderers

A rich attribute kind is a value shape plus one renderer (ADR-0021). The value
carries its own `kind` tag, so no column schema is involved:

```ts
// Feature data produced by your protocol/provider:
attributes: {
    elevationChart: { kind: "chart", url: "/charts/e12.svg", title: "Profile" },
}
```

```ts
// In your module's register():
const t = context.locale.t("my-module");
context.attributeRenderers.register({
    id: "chart",
    matches: (value) =>
        typeof value === "object" && value !== null &&
        (value as Record<string, unknown>).kind === "chart",
    renderCell: (value, { open }) =>
        isChartValue(value)
            ? <ChartCell chart={value} label={t("chart.open")} onOpen={open} />
            : null,
    renderViewer: (value, { close }) =>
        isChartValue(value) ? <ChartView chart={value} onClose={close} /> : null,
});
```

The first registered renderer whose `matches` accepts a value renders it — in the
attribute table and in feature info alike; the viewer opens as a maximized
widget window (title, close, drag — the standard window chrome comes for free).
Keep the predicate strict. Strings: `api.dict` carries the **core** dictionary
only — read your own labels through your module's locale namespace (a closure
over `context.locale.t(...)` re-reads the current language on every render),
never by registering into `core`. A built-in is replaced by id with
`{ override: true }` — registration order alone cannot outrank it. The
built-ins `photo` and `album` (`PhotoAttributeValue`, `AlbumAttributeValue`)
are the reference implementation; the full contract is in
[api/extensions.md](api/extensions.md#attributevaluerenderer).

## Source adapters

A module registers its own `SourceAdapter`
(`context.sourceAdapterFactory.register`) when the data source is not STAC at all;
the adapter contract (initialization from the `layer-tree.data-source-url` setting,
root/children fetching, node construction) is in
[api/extensions.md](api/extensions.md#source-adapters). The built-in `stac` adapter
can be replaced the same way — register an adapter of type `"stac"` with
`{ override: true }`; the replacement then owns the whole catalog-to-tree mapping,
including asset routing and capability assignment.

## Registration order and overrides

Built-ins register first, modules in array order, then `settingsOverrides` apply
and the source fetch runs (ADR-0005). Registries throw on a duplicate id; a
deliberate replacement passes `{ override: true }` (which surfaces support it, and
what each override replaces, is tabulated in
[api/extensions.md](api/extensions.md#contexts)). A `register` that throws fails
initialization with the error screen; retry rebuilds from empty stores.
