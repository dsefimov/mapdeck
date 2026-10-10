# ADR-0004: Extension model — one class shape, module as primary container

## Context

The app is a geospatial constructor: a small generic core plus domain-specific functionality
delivered as extensions. The built-in set (generic widgets, layer tools, map tools) lives
in this repository under `src/widgets/`, `src/layer-tools/`, `src/map-tools/`; external
developers deliver domain extensions the same way — as modules. Core must never depend on
domain-specific code.

## Decision

**Four extension kinds, one shape.** Widgets, layer tools, map tools, and modules are
distinct kinds with their own identity/activation stores, but every extension is a class
instance. One shape removes the runtime discrimination between object-shaped and
class-shaped extensions (`isMapTool` checks, union types) and makes the shape stable when
requirements change: an extension that later needs observable state or lifecycle is
already a class. Stateless extensions are classes without observable fields; stateful ones
add MobX-observable fields and lifecycle methods. A single unified `Extension` interface
with a type discriminator was rejected for the same reason: the kinds have different
registration stores and lifecycles.

**Registration is cross-cutting.** Each kind's identity and activation state live in its
home store (widget → `widgetStore`, layer tool → `layerToolStore`, map tool → `mapToolStore`),
but a registration routine may touch other stores — e.g. a map tool registers its panel
widget via `widgetStore` and its translations via `localeStore` alongside itself. The home
store is an identity boundary, not an exclusivity boundary. Modules use the exact same
stores through the `StoreRegistry` context.

**Contract hygiene.** The kernel holds only multi-consumer types and never imports from
`@core/ui`: the dead `WidgetContext` interface was removed (zero consumers), and the
map-tool contract carries `icon` as a plain string — consumers validate it with the ui
kit's `isIconName` guard instead of the contract importing `IconName`. Widgets already
carried plain-string icons; `ui` and `contracts` must not import each other. The kernel
is also extension-neutral: it carries no constants or handles naming a concrete
extension (a widget id, an opener handle) — those live with their extension, and
cross-extension coordination goes through state keyed by that identity.

**Widget windows are session workspace.** A widget window's layout and z-order survive
close: closing keeps them, reopening restores position and size and raises the window;
when the maximum z-index reaches 10 000 the open windows are renumbered from 1, so
z-order cannot grow unboundedly. The map and the sidebar are static chrome outside the
widget grid.

**Module as primary container.** Domain-specific functionality — widgets, layer tools,
map tools, source adapters, protocols, any combination — is delivered as a module.
`register(context)` receives a `ModuleContext` — the map of declared extension points:
`sourceAdapterFactory`, `protocols`, `featureProviders`, widget / layer-tool / map-tool
registration (including tool-to-protocol links, ADR-0007), locale and settings; the
runtime service `stateStore` is shared by both slices. Every member is typed by a port
declared in `contracts/` — the registration ports `SourceAdapterFactory`,
`ProtocolRegistrationPort`, `FeatureProviderRegistrationPort`, `LocaleRegistrationPort`,
`SettingsRegistrationPort`, each extending or accompanying the read-only port the
runtime slice exposes (`ProtocolRegistry`, `FeatureProviderRegistry`, `LocaleApi`; a
settings read port appears when a real reader does). `StateStore` is already a `lib`
type — so the context family imports neither `common/` nor a domain. The family has one
shape: a runtime slice shared by every consumer (services and read ports) plus a
registration slice (`register*` functions) that only modules receive; tool panels get
the runtime slice (ADR-0006). A module never receives the domain stores (`treeStore`,
`mapStore`, `basemapStore`): it changes kernel behavior through the declared points,
never by reaching into store internals. The built-in set stays limited to
generic, non-domain-specific tools. Core never imports from `src/modules/` — the
boundary is one-directional through registration interfaces.

Why not the full `StoreRegistry` (the previous decision): reach-in access makes every
internal kernel refactoring a breaking change for modules, while a declared point is a
stable contract. "A module must be able to change any point of the application" is
satisfied by the completeness of the point map — a behavior no point covers is a missing
point (a legitimate extension request, added as a new point), not an invitation to reach
into internals. Replacing a base entry is the explicit override of ADR-0005, not a
side effect of registration order.

**Module-to-module dependencies.** `dependencies: string[]` is informational — it
documents module-to-module coupling for readers. Nothing is enforced at runtime
beyond a warning naming an unknown dependency at registration; the app
is built (tsc) before every delivery, so a missing import is a compile-time error, and
module execution order is simply the order of the module array. Cross-imports between
`widgets/`, `layer-tools/`, `map-tools/` remain forbidden.

## Consequences

- Module registrations are fire-and-forget: the system does not track what a module
  registered, so there is no unload path. Module unloading is not a use case.
- No lazy loading: all extensions register at init. Acceptable at the current count.
- Core's registration interfaces are the only contract external developers need to learn;
  built-in and module-delivered extensions look identical to consumers.

