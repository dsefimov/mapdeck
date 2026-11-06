# Extension API reference

The public contracts for building modules: what registers where, the exact context
surfaces, and the behavior of every registration. The how-to guide with walkthroughs
is [docs/extending.md](../extending.md); configuration options live in
[configuration.md](configuration.md).

## Import entry points

| Entry | Provides |
|---|---|
| `mapdeck` | `createMapdeck`, `MapdeckRoot`, `createToolPanelWidget`, and the top-level types: `MapdeckOptions`, `MapdeckInstance`, `Module`, `ModuleContext`, `ToolRuntimeContext`, `Widget`, `MapTool`, `LayerTool`, `SourceAdapter`, `SettingMetadata`, `BaseMapConfig`, `Feature`, `RegisterOptions` |
| `mapdeck/contracts` | the full contract barrel: ports (`OverlayManager`, `MapContext`, `AssetMappingPort`), node and render types (`TreeNode`, `LayerNode`, `ProtocolBinding`, `RenderDescriptor`, `RenderUnit`), protocol/adapter types, feature-provider and point-cloud types, `FeatureRow`, `MAP_TOOL_KIND`, per-kind tool types |
| `mapdeck/ui` | panel-building surface: primitives (`Button`, `Icon`, `TextInput`, `SelectInput`, `SliderInput`, …), composites (`ToolPanel`, `SegmentsList`, `DataTable`, `ColorPicker`, `SummarySection`, menus), interaction hooks (`useClickOutside`, `useEscapeKey`, `useMenuKeyboard`, `useMapCursor`, `useDebounce`), theme helpers (`getThemeColor`, `subscribeTheme`, `useMeasureColors`, …), `isIconName` |
| `mapdeck/utils` | pure helpers: `formatDistance`, `formatArea`, `formatVolume`, `convertPointToDegrees` |

The application chrome (`WidgetGrid`, boot screens, error boundaries) is not exported.

### MapLibre and deck.gl types

The contracts reference engine types inline (`maplibregl.Map` in tool contexts,
deck.gl `Layer`/`Viewport` in the overlay port) but do not re-export them, and the
engines are not peer dependencies of `mapdeck`. A module that needs the types
installs `maplibre-gl@^5` itself (a dev dependency is enough for types). At runtime,
work through the `map` instance the context hands you: a module that instantiates
engine classes (`new maplibregl.Marker()`) imports its own engine copy and owns the
duplication cost.

## Module

```ts
import type { Module } from "mapdeck";

export const myModule: Module = {
    id: "my-module",              // kebab-case
    name: "My module",
    dependencies: ["other-module"], // optional, informational
    register(context) { /* registrations */ }, // sync or async (awaited)
};
```

- `register` may be synchronous or return a promise; bootstrap awaits it.
- A throw inside `register` fails initialization (`initError`); registrations already
  performed stay, and retry rebuilds from empty stores.
- `dependencies` documents coupling; an id no registered module carries logs a
  warning.
- Modules run in array order after the built-ins. There is no unload or dispose hook
  for modules — see [Cleanup and ownership](#cleanup-and-ownership).

## Contexts

`ModuleContext` (modules) and `ToolRuntimeContext` (tool panels and actions) share a
runtime slice:

| Member | Type | Purpose |
|---|---|---|
| `stateStore` | keyed instance-state container | per-instance controllers: `get(key, factory)`, `remove(key)`, `peek(key)` |
| `locale` | locale API | translate: `t(namespace)` returns the current dictionary |
| `protocols` | protocol registry (read) | resolve descriptors |
| `featureProviders` | feature-provider registry (read) | feature-info queries |
| `layerTree` | layer catalog (read) | nodes, visibility, render errors |
| `mapToolState` | map-tool state (read) | active tool queries |
| `basemap` | basemap port (read) | active basemap |

`ModuleContext` narrows the read-only members to their registration views and adds:

| Member | Registers | Duplicate id | `{ override: true }` |
|---|---|---|---|
| `protocols` | protocols with an optional asset-mapping declaration | throws | replaces the protocol and re-applies its declaration |
| `featureProviders` | feature-info providers | throws | replaces |
| `locale` | translations (per namespace, per language) | merges, idempotent — never throws | not applicable |
| `settings` | setting declarations | throws (atomic batch) | replaces the owner's batch, drops its stale ids |
| `basemap` | basemap configs (validated: non-empty `id`/`name`, inline style or `styleUrl`) | throws | replaces, re-applies if active |
| `sourceAdapterFactory` | source adapters | throws | replaces the adapter for its `type` |
| `widgets` | widgets | throws | replaces, resets instance state |
| `layerTools` | layer tools; `bindToolToProtocol(protocolId, slot, toolId)` | throws | replaces |
| `mapTools` | map tools (auto-registers the tool's settings and translations) | throws | replaces |
| `assetMapping` | matching rules and slot fitness | rules: none (priority-ordered); slots: throws | slots only |

Cross-reference checks: `bindToolToProtocol` with an unregistered **tool id** throws
at bind time; a binding to an unregistered **protocol id** fails at the end of
bootstrap (after modules) through `initError`. Capabilities a source assigns against
missing links are dropped with a logged warning.

## MapTool

Toolbar extensions over the map (ADR-0006). Shared fields: `id` (also the locale
namespace), `icon` (string — a registry name or a custom `--icon-<name>` token),
optional `localeTranslations`. Two kinds:

- `kind: "interactive"` — `component` (the panel; receives
  `{ context, map, overlayManager, deactivate }`), optional `onActivate(map)` /
  `onDeactivate(map?)` hooks, optional `contextMenu` behavior. Clicking the button
  toggles activation; activating one tool deactivates the other.
- `kind: "action"` — `execute({ context, map })`, runs once per click without
  touching the active interactive tool.

`map` is the raw `maplibregl.Map` — the documented platform-technology exception.
Register the panel yourself: `context.widgets.registerWidget(createToolPanelWidget(tool))`.

## LayerTool

Per-node actions in the tree's "More" menu (ADR-0007). Fields: `id`, `component` (a
factory `(nodeId: string) => ReactNode` — receives the node id, reads the node from
the tree), optional `localeTranslations`. A tool reaches nodes only through
`context.layerTools.bindToolToProtocol(protocolId, slot, toolId)`; the source must
still assign the capability to the node.

## Widget

A panel in the workspace grid: `{ id, name?, icon, placement, component }` where
`component` receives `{ widgetId }`. Layout and z-order persist for the session;
closing keeps them. `createToolPanelWidget(tool)` produces the overlay-placement
widget an interactive map tool needs.

## Protocol and LayerAdapter

A protocol names how a format renders (ADR-0009):

```ts
import type { Protocol, LayerAdapter } from "mapdeck/contracts";
```

- `id`, `label` — identity.
- `defaultStyle: LayerStyle` — required; written in the style-layer vocabulary of
  the MapLibre Style Specification (`paint`, `layout`, `minzoom`, `maxzoom`, …).
  Each protocol interprets the properties relevant to it and ignores the rest.
- `createRenderDescriptor(sourceUrl, style?)` — merges the node style over the
  default and returns a typed `RenderDescriptor<C>`.
- `getLayerAdapter(): LayerAdapter` — the rendering backend.
- Optional `fetchAttributes` (attribute-table feed) and `groupRenderUnits`
  (batching of consecutive render units).

`LayerAdapter` has two families: native MapLibre layers (`addToMap`, `removeFromMap`,
`updateVisibility`, `updateConfig`, `nativeLayerOrdering: true` — tree order is the
z-order) and overlay layers that draw through `MapContext.overlayManager`
(deck.gl; `nativeLayerOrdering: false`). Adapters receive a `MapContext`
(`{ map, overlayManager, reportLayerError?, camera queries }`) per call.

Register with the asset-mapping declaration in one call:

```ts
context.protocols.register(protocol, opts?, {
    slots: { renderer: 90 },       // slot fitness per node slot
    rules: [{ priority: 5, canResolve(asset) { … }, resolve(asset) { … } }],
});
```

Matching: rules are priority-ordered (lower first, registration order breaks ties);
the first claiming rule wins an asset; the best slot fitness wins each slot;
slot-less assignments become report links. `context.assetMapping.registerRule` /
`registerSlots` remain for separate registration. `SourceAsset` is an open record
(`href`, optional `title`, `type`, `roles`, plus source-specific fields the core
never reads).

## Source adapters

The port a data source implements to feed the tree (ADR-0009; the STAC example is
described in [protocols.md](protocols.md)):

- `type` — the source-type key (`defaultSourceType` names one).
- `initialize({ url })` — receives the `layer-tree.data-source-url` setting value;
  called when the adapter is selected and re-called when the setting changes.
- `fetchRoot()` / `fetchChildren(nodeId)` — return ready nodes: bindings,
  capabilities, styles. Route assets through `context.assetMapping.mapAssets` at
  fetch time; assign only capabilities whose tool links exist (the core verifies and
  drops the rest with a warning).
- `dispose()` — release adapter resources.

Register with `context.sourceAdapterFactory.register(adapter, config?, opts?)`;
replacing the built-in STAC adapter is an explicit
`register(adapter, undefined, { override: true })` under the type `"stac"` — the
replacement takes over the whole catalog mapping.

## FeatureProvider and FeatureRow

Feature info (map click) is a separate port from the protocol: a provider collects
the features at a position for the layers it serves. Register through
`context.featureProviders.register(id, provider)`. Attribute-table rows are
`FeatureRow`s: an open record of data properties plus reserved keys — `_bbox` is the
geometry-derived zoom target. Writers spread data properties first, so a data column
cannot overwrite a reserved value; the reserved set is declared on the interface.

## Point-cloud data port

`mapdeck/contracts` exports the point-cloud types tools use: `PointCloudDataAdapter`
(`getLoadedData(layerId)` / `getAllLoadedData()`) with the runtime-checked narrowing
`toPointCloudDataAdapter`, the frame and data types (`PointCloudFrame`,
`PointCloudData`, `CloudPoint`), color schemes (`ColorScheme`,
`classificationColor`), and the picking helpers (`pickPointFromCloud`,
`getPointWithFallback`, `getPointFromPickingInfo`). Read cloud data by capability,
never by protocol id (ADR-0012).

## Settings

Declared by their owner; values validate against the metadata. The full contract —
kinds, defaults, validation, override policy, and the `settingsOverrides` channel —
is in [configuration.md](configuration.md).

## Locale

```ts
context.locale.registerTranslations("my-module", {
    en: { "tool.name": "Distance" },
    ru: { "tool.name": "Замер" },
});
```

- Registration merges per namespace and language and is idempotent.
- Resolution: a namespace resolves to the current language's dictionary, or — when
  that language has no registration for the namespace — to the whole English
  dictionary. There is **no per-key merge** across languages.
- `en` is not enforced by the API, but it is the fallback: a namespace without an
  `en` dictionary renders nothing for languages it does not cover (consumers fall
  back to raw ids). Register `en` for every namespace.
- A missing key in the resolved dictionary renders the consumer's fallback (usually
  the raw id).

## Basemaps

`context.basemap.registerConfigs(configs, opts?)` — each config carries `id`, `name`,
tile/source definitions as a MapLibre style (`style`) or a `styleUrl` fetched at
registration, plus attribution. Configs are validated at registration; a built-in
may be replaced by id with `{ override: true }`.

## Icons

`icon` fields accept any string. Registry names (the built-in set, checkable with
`isIconName`) render built-in artwork. Any other `[\w-]+` name renders the
`--icon-<name>` CSS custom property as a mask image — define it on your container:

```css
.mapdeck-root { --icon-terrain: url("terrain.svg"); }
```

The icon file must be reachable under the host's CSP.

## Cleanup and ownership

- Resources registered through the context — widgets, tools, protocols,
  translations, settings, basemaps — are released with the instance: disposal walks
  the store graph, and keyed `stateStore` entries carrying `dispose` are disposed
  with it.
- A tool controller that acquires listeners or reactions should expose `dispose()`
  and live in `stateStore`, so instance disposal reaches it.
- Modules have no unload or dispose hook: a module that starts background work
  outside the context (timers, sockets, workers of its own) has no callback to stop
  it — keep such work out of modules, or tie it to a widget/tool lifecycle.
