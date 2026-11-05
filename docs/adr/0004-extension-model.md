# ADR-0004: Extension architecture

Status: Accepted · Date: 2026-09-22

## Context

The application is a geospatial application framework: a small generic core plus
domain-specific functionality delivered as extensions. The built-in set (generic widgets,
layer tools, map tools) lives in this repository under `src/widgets/`, `src/layer-tools/`,
`src/map-tools/`; external developers deliver domain functionality the same way — as
modules. The core must not depend on domain-specific code.

## Decision

**Three extension kinds; the module is the composition unit.** Widgets, layer tools and
map tools are extension kinds, each with its own identity and activation store. The
module is not a fourth kind: it packages registrations of any combination of extensions
plus source adapters and protocols. Every extension is an object implementing its
contract interface; a class is the form for extensions with observable state or
lifecycle, a plain object literal is enough for stateless ones. The registries treat
both identically: they read the contract's fields and never test for `instanceof`. A
unified `Extension` interface with a type discriminator was rejected: the kinds have
different registration stores and lifecycles.

**Registration is cross-cutting.** Each kind's identity and activation state live in its
home store (widget → `widgetStore`, layer tool → `layerToolStore`, map tool →
`mapToolStore`), but a registration routine may touch other stores — e.g. a map tool
registers its panel widget via `widgetStore` and its translations via `localeStore`
alongside itself. The home store is an identity boundary, not an exclusivity boundary.

**Contract hygiene.** The core holds only multi-consumer types and does not import from
`@core/ui`: the map-tool contract carries `icon` as a plain string, and consumers
validate it with the ui kit's `isIconName` guard; `ui` and `contracts` do not import each
other. The core also carries no constants or handles naming a concrete extension (a
widget id, an opener handle) — those live with their extension, and cross-extension
coordination goes through state keyed by that identity.

**Widget windows persist for the session.** A widget window's layout and z-order
survive while the instance lives: closing keeps them, reopening restores position and
size and raises the window; when the running z-index reaches the
`Z_INDEX_RESET_THRESHOLD` cap the open windows are renumbered from 1, so z-order does
not grow unboundedly. The map and the sidebar are static workspace chrome outside the
widget grid.

**Module as the delivery unit.** `register(context)` receives a `ModuleContext`: a
runtime slice (services and read ports) shared by every context consumer, plus a
registration slice that only modules receive; tool panels get the runtime slice
(ADR-0006). Every member is typed by a port declared in `contracts/` — the registration
ports extend or accompany the read-only ports the runtime slice exposes — so the context
family imports neither `common/` nor a domain. The full field inventory is documented in
[docs/api/extensions.md](../api/extensions.md). A module does not receive the domain
stores (`treeStore`, `mapStore`, `basemapStore`): it changes core behavior through the
context's interfaces, not by reading store internals. The built-in set covers the shipped
protocols' own controls — including the COPC-specific tools such as point size and color;
anything beyond them is provided by a module. The core does not import from
`src/modules/`; the boundary runs one way, through the registration interfaces.

Why not the full `StoreRegistry`: reach-in access makes every internal refactoring a
breaking change for modules, while an interface is a versioned contract. The raw
registry stays internal: first-party panels reach the store graph through the shell
package, and the facade handle's `store` field (kept for `MapdeckRoot`) is the only place
the registry meets the public surface. A host with a real need gets a designed,
versioned interface instead. A behavior no interface covers is a request to add one, not
a reason to read internals; replacing a base entry is the explicit override of ADR-0005.

**Module-to-module dependencies.** `dependencies: string[]` is informational — it
documents module-to-module coupling for readers. Nothing is enforced at runtime beyond a
warning naming an unknown dependency at registration; the app is built (tsc) before every
delivery, so a missing import is a compile-time error, and module execution order is the
order of the module array. Cross-imports between `widgets/`, `layer-tools/`, `map-tools/`
remain forbidden.

## Consequences

- Module registrations are not tracked, so there is no unload path; module unloading is
  not a use case. Extension resources registered through the context are released with
  the instance (ADR-0003).
- All extensions register at init; there is no lazy loading. Acceptable at the current
  count.
- The core's registration interfaces are the contract external developers learn;
  built-in and module-delivered extensions look identical to consumers.
