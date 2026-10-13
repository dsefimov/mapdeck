# ADR-0006: Map tools — toolbar, one contract, two invocation modes

## Context

Map tools are the map-level extension point. A toolbar widget collects all registered map
tools as buttons over the map: clicking a button either executes a one-shot action (reset
orientation) or activates an interactive tool (measurement, basemap switching, feature
inspection), whose panel opens next to the toolbar. At most one interactive tool is
active, so at most one panel is visible.

This ADR records how map tools are structured.

## Decision

**One `MapTool` contract, discriminated by `kind`.** Every map tool is a class instance
(ADR-0004) implementing the single contract name `MapTool` — a discriminated union with
shared fields and a required `kind`:

- `kind: "interactive"` — carries `component` (the panel), optional lifecycle hooks, and
  optional `contextMenu` behavior. Clicking its button toggles activation.
- `kind: "action"` — carries `execute(rootStore)`. Clicking its button executes it
  immediately; it has no active state and no panel.

Shared fields: `id` (also the locale namespace), `icon` (a plain string — ADR-0004),
optional `settings`, `localeTranslations`. The discriminant values are exported as
the constant `MAP_TOOL_KIND` — the single source for every `kind` comparison; the
store and the toolbar branch on it, never on bare strings. The contract exposes one
name — `MapTool` — and the store and the toolbar
branch on `kind`. Why one name: module authors learn one
contract, consistent with ADR-0004's one-shape direction. Why `kind` and not optional
fields: optional fields cannot express "exactly one capability" in the type system, so
that rule would have to live in a runtime test — the discriminant keeps it in the types,
where it is checked at compile time.

**The map engine is platform technology for tools.** Tool components and lifecycle
hooks receive the raw `maplibregl.Map`. This is a documented exception to "external
systems sit behind ports": a map tool operates on the map the way a component operates
on the DOM — the engine is its environment, not a detail behind an interface. Wrapping
the full MapLibre API in a port was rejected: the facade would grow into a mirror of
MapLibre (events, projection, camera, canvas) while adding no second implementation.
The boundary stays meaningful where it is load-bearing: the kernel (the map domain,
protocol adapters) accesses the map through `MapContext` (ADR-0010), and a module that
delivers no map tool never receives the map instance.

**Panels and actions receive a tool context, not the registry.** A tool panel's props
carry `ToolRuntimeContext` — the same declared-points surface modules get (ADR-0004): the
runtime slice of the context family (state store, locale, settings, the protocol and
feature-provider ports) plus the tool's own controller, `map` (platform technology,
above), `overlayManager`, and `deactivate`. An action tool's `execute` receives
`{context, map}`. The full `StoreRegistry` is not part of the map-tool contract:
built-in and module-delivered tools are identical to consumers (ADR-0004), so one
standard applies to both — two standards would drift apart. Consequently the contract
in `contracts/extension/map-tool.ts` names no registry, and `contracts/` keeps no edge
into the store graph.

**Toolbar and panels.** The toolbar widget renders one button per registered tool, in
registration order. An action click executes and is done; an interactive click toggles
activation. The active tool's panel is registered through the widget catalog
(`createToolPanelWidget`) so it reuses widget machinery instead of duplicating it, but it
renders outside the shared grid: `MapWorkspace` renders it over the map next to the
toolbar, without chrome, and the panel component returns null while its tool is inactive.
Visibility is therefore owned solely by the tool's active state; the widget open/close
state does not apply to panels.

**Single active tool, state owned by the store.** `MapToolStore.activeToolId` is the only
record of which interactive tool is active — a tool never carries its own active flag.
Activating a tool deactivates the currently active one. Why: simultaneous interactive
tools would fight over the same map events.

**Action tools are independent.** Executing an action never deactivates the active
interactive tool. Why: an action is a one-shot command and must not disrupt an ongoing
interaction (a measurement in progress).

**Lifecycle hooks and dismissal are different things.** The store calls the tool's
lifecycle hooks — `onActivate(map)` / `onDeactivate(map?)` — for tools with real activation
logic (setup and cleanup of map listeners, reactions). The panel component separately
receives a `deactivate` prop — the dismissal callback that deactivates the tool from the
panel's own UI (Done/Close buttons). The two roles carry distinct names because they are
distinct contracts: one is called by the store, the other by the panel.

**Placement and order.** The contract carries no placement fields: button position is
fixed by the toolbar's CSS — one overlay with absolute positioning — and button order is
registration order. Why: a per-tool placement field promises behavior the toolbar does
not implement; corner grouping, if ever wanted, becomes a feature with its own contract.

**Registration.** Tools register explicitly via `MapToolStore.registerTool` in
`registerMapTools` (ADR-0005). Registration also auto-registers the tool's settings with
`SettingsStore` under the tool id; a duplicate id throws (ADR-0005 duplicate policy).

**Amended 2026-10-13: the panel widget factory is public.** `createToolPanelWidget`
is exported from the package's main entry: a module delivering an interactive map
tool registers its panel explicitly — locale, tool, then
`context.widgets.registerWidget(createToolPanelWidget(tool))`, the same three
steps the built-in `registerMapTools` takes. Auto-registering the panel inside
`MapToolStore.registerTool` was rejected: it would make the store do the widget
catalog's job and change its behavior for every existing registration site;
explicit registration is sufficient and keeps the store's single responsibility.

## Consequences

- Module developers learn one contract: a `MapTool` of `kind` `"interactive"` or
  `"action"`.
- The compile-time guarantee "every tool has exactly one capability" is preserved by the
  discriminant; no runtime invariant test is needed.
- Panels reuse widget registration but bypass the grid's open/close state — closing a
  panel means deactivating the tool, and only the tool's active state decides visibility.
- Action tools never disrupt an active tool.
- Button order is registration order — moving a tool in the registration sequence moves
  its button.

