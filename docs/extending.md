# Extending mapdeck

A practical guide for extension modules — the code a host application
adds on top of the embedded library. The decision records behind these
surfaces live in `docs/adr/`; this page is the how-to.

## Package entry points

| Entry | What it is for |
|---|---|
| `mapdeck` | `createMapdeck(options)`, `MapdeckRoot`, module/extension types, `createToolPanelWidget`, `StoreProvider`/`useRootStore` |
| `mapdeck/contracts` | The full contract barrel for deep integrations: ports (`OverlayManager`, `MapContext`), registration surfaces, asset-mapping types, point-cloud picking |
| `mapdeck/ui` | The design-system surface for panels: primitives, inputs, `ToolPanel`/`SegmentsList`/`DataTable`/`ColorPicker`, interaction hooks, theme helpers |
| `mapdeck/utils` | Pure helpers: geo formatters |
| `mapdeck/styles.css` | The token chain — one file styles built-ins and extensions alike |

## Module anatomy

A module is a plain object implementing `Module`: `id`, `name`, and
`register(context)`. Pass modules to `createMapdeck({ modules: [...] })`;
they run after the built-in set, in array order, so a later module may
override a built-in registration with `{ override: true }`.

`context` (`ModuleContext`) is the declared-points surface — the runtime
slice (state store, locale, registries) plus every registration port.
Anything the context does not expose is kernel-private by design; a
missing capability is an extension request, not an invitation to reach
into internals.

## A map tool with a panel

Three explicit steps (locale, tool, panel widget) — the same steps the
built-in `registerMapTools` takes:

```ts
import type { Module, InteractiveMapTool } from "mapdeck";
import { createToolPanelWidget } from "mapdeck";
import { ToolPanel, useEscapeKey } from "mapdeck/ui";

const distanceTool: InteractiveMapTool = {
    kind: "interactive",
    id: "my-distance",
    name: "Distance",
    icon: "ruler",            // registry name, or a custom --icon-<name>
    component: DistancePanel, // receives { context, map, overlayManager, deactivate }
    localeTranslations: { ru: { name: "Замер" } },
};

export const myModule: Module = {
    id: "my-tools",
    name: "My tools",
    register(context) {
        context.locale.registerTranslations(distanceTool.id, distanceTool.localeTranslations);
        context.mapTools.registerTool(distanceTool);
        context.widgets.registerWidget(createToolPanelWidget(distanceTool));
    },
};
```

A panel is a plain React component; `map` is the raw MapLibre instance
(platform technology), `context` is the runtime slice
(`ToolRuntimeContext`), `deactivate` closes the panel. Build the UI from
`mapdeck/ui` — token overrides in the host restyle it together with the
built-ins.

Action tools (`kind: "action"`) carry `execute({ context, map })`
instead of a component and need no widget registration.

## A layer tool

```ts
context.layerTools.registerTool({
    id: "my-opacity",
    component: OpacitySlider, // props carry the binding it edits
});
context.layerTools.bindToolToProtocol("my-protocol", "renderer", "my-opacity");
```

The binding is what makes the tool appear on nodes of that protocol —
the same link mechanism the built-ins use.

## A protocol

A protocol names how a source renders. Register it with its asset-mapping
declaration — slot fitness (which node slots it serves and how well) and
matching rules (which assets it claims) arrive with the protocol in one
call:

```ts
import type { Module, Protocol, SourceAsset } from "mapdeck/contracts";

const terrainProtocol: Protocol = { /* id, label, defaultStyle,
    createRenderDescriptor, getLayerAdapter */ };

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

Assets come from the source adapter (the built-in STAC tree maps item
assets through the same kernel mapper), so a protocol declared this way
receives nodes with no source-specific import. The lower-level path —
`context.assetMapping.registerRule(...)` and
`context.assetMapping.registerSlots(id, slots)` — remains valid when the
rules or slots register separately from the protocol.

## Settings, locale, basemaps

- `context.settings.registerSettings(ownerId, ownerName, metadata[])` —
  register-once; per-deployment *values* travel through the
  `settingsOverrides` embed option instead.
- `context.locale.registerTranslations(namespace, { ru: {...} })` — a
  namespace falls back whole-dict to `en` when the current language has
  no registration.
- `context.basemap.registerConfigs([...])` — basemap configs; a built-in
  may be replaced by id with `{ override: true }`.

## Icons

Registry names (`isIconName`) render built-in artwork. Any other name
renders the `--icon-<name>` CSS token — define it on your container
(e.g. `.mapdeck-root { --icon-terrain: url("terrain.svg"); }`) and the
toolbar renders it. No registry change needed.

## Source adapters

A module may register its own `SourceAdapter`
(`context.sourceAdapterFactory.register`) — including an override of the
built-in `stac` type — when the data source is not STAC at all. The
adapter receives `initialize({ url })` from the
`layer-tree.data-source-url` setting.
