## Context

The portal uses MobX as its state management library. All business state lives in MobX stores — React `useState` is reserved exclusively for UI trivia (hover, focus, animation). The store system is a central architectural pillar: 10 global stores created in `RootStore`'s constructor, plus widget-local stores created on-demand. Every extension developer who creates a widget, map tool, or module with state needs to understand the store lifecycle and access rules.

## Goals / Non-Goals

**Goals:**
- Document the MobX configuration and its runtime guarantees
- Document global vs local store lifecycles
- Document the initialization state contract (`isInitialized` / `initError`)
- Document store disposal and cross-store access rules
- Explain the architectural decisions behind the current design

**Non-Goals:**
- Changing any MobX configuration or store behavior
- Specifying the internal structure of individual stores (covered by their respective specs)
- Documenting the useState vs MobX decision guide (already in AGENTS.md)

## Decisions

### MobX over Redux / Zustand / Jotai

The portal chose MobX for its observable-based reactivity model rather than Redux (action/reducer dispatch), Zustand (hook-based), or Jotai (atomic state).

**Why MobX**: MobX's `@observable` + `@computed` + `observer()` pattern maps directly to the portal's component architecture. Components read observables; MobX tracks dependencies and re-renders only when needed. No manual selector memoization, no `useSelector` boilerplate.

The `@action` decorator provides a clear boundary: all mutations are explicitly marked. `computedRequiresReaction` catches stale reads at runtime.

**Alternatives considered**:
- **Redux Toolkit** — rejected because the action/reducer/dispatch pattern adds boilerplate for the portal's many fine-grained observable updates (layer config changes, visibility toggles). MobX's transparent reactivity handles these naturally.
- **Zustand** — rejected because it's hook-based; stores would be created inside React components, conflicting with the portal's rule that business state lives outside React.
- **Jotai** — rejected for similar reasons: atoms are designed for component-level state, not for the 10-store global service layer the portal needs.

### Service locator (RootStore) over individual React Contexts

The portal uses a single `RootStore` accessed via `useRootStore()` rather than individual React Context providers for each store.

**Why**: The portal has 10 stores. Creating a React Context per store would produce deep nesting (`<TreeStoreProvider><MapStoreProvider>...`) and make the component tree harder to read. A single `StoreProvider` wrapping `RootStore` keeps the tree flat.

Store-to-store access is through `rootStore.otherStore` — the dependency graph is explicit in RootStore's constructor. Individual contexts would hide these dependencies behind React's context resolution.

**Why not pure DI container**: The portal could use a DI library (Inversify, TSyringe) for constructor injection. Rejected because it adds a dependency and configuration overhead. The current approach — RootStore manually instantiating all stores — is explicit, debuggable, and zero-cost.

Source: `src/core/framework/store/root/rootStore.ts`, `context.tsx`

### enforceActions: "always"

All observable mutations must happen inside `@action`-decorated methods or `runInAction()` callbacks. Accidental mutations outside actions throw at runtime.

**Why**: This prevents the most common MobX bug — mutating an observable in an async callback without wrapping in `runInAction()`. With `enforceActions: "always"`, such mistakes fail immediately with a clear error message.

**Trade-off**: Some patterns require explicit `runInAction()` wrapping that would be implicit in "never" mode. Mitigation: the async pattern (see below) is standardized across all stores.

Source: `src/core/framework/store/root/mobxConfig.ts`

### computedRequiresReaction: true

Reading a `@computed` value outside a reactive context (observer, autorun, reaction) throws at runtime.

**Why**: Without this guard, computed values read outside reactive contexts return stale data silently. This is a common source of bugs where a developer reads a computed value in an event handler or setTimeout and gets an outdated result. The guard catches these immediately.

**Trade-off**: Debugging code must wrap computed reads in `autorun()` even for one-off inspections. Mitigation: the safeguard is a development-time protection; it doesn't change production behavior.

Source: `src/core/framework/store/root/mobxConfig.ts`

### Global vs Local store split

Global stores (10 in RootStore constructor) live for the app lifetime. Local stores (created via `getWidgetStore()`) live per widget instance and persist across open/close cycles.

**Why global stores**: They hold shared state — tree data, map instance, settings, catalogs. Multiple widgets and tools depend on them. Creating them once avoids coordination problems.

**Why local stores**: Widget-specific state (filter values, selections, sort order) shouldn't pollute global stores. `getWidgetStore(id, factory)` provides lazy creation and persistence: the store survives `closeWidget()` → `openWidget()` cycles but is destroyed when the widget is unregistered.

Source: `src/core/framework/store/widget/WidgetOverlayStore.ts`

**Local store patterns**: Three patterns coexist, chosen based on scoping needs:

| Pattern | Creation | Lifetime | Persists across open/close? | Use when |
|---|---|---|---|---|
| **A: widget-local** | `overlayStore.getWidgetStore(id, factory)` | Widget registration → unregistration | Yes | Widget needs to remember filters, sort order, selection across close/reopen |
| **B: tool-owned** | `new Store()` in tool's `activate()` | Tool activation → deactivation | No | Measurement tools, drawing tools — fresh state each activation |
| **C: inline observable** | `observable` field on tool class | Tool instance lifetime | N/A | Minimal state (1-3 fields) that doesn't justify a separate class |

Pattern A is implemented by `WidgetOverlayStore.getWidgetStore()` (see `src/core/framework/store/widget/WidgetOverlayStore.ts`). Pattern B is used by `MeasureToolStore` and `VolumeMeasureStore` (see `src/map-tools/`). Pattern C is the recommended approach for simple map tools per `map-tools/spec.md`.

**When to use pattern A vs global store**: If state is shared across multiple widgets or tools, it belongs in a global store. If state is scoped to a single widget instance (filters, selections, UI mode), it belongs in a widget-local store. When in doubt, default to global — it's simpler and more discoverable.

### Async pattern: @action + runInAction

All async operations follow a standard pattern:

```ts
@action
async fetchData(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
        const data = await api.fetch();
        runInAction(() => { this.data = data; });
    } catch (e) {
        runInAction(() => { this.error = String(e); });
    } finally {
        runInAction(() => { this.loading = false; });
    }
}
```

**Why `@action` on the method**: The initial `loading = true` and `error = null` assignments are synchronous — they happen inside the action. The `await` suspension point leaves the action context, so mutations after `await` need `runInAction()` to re-enter.

**Why `runInAction`, not separate `@action` methods**: Wrapping post-await mutations in `runInAction()` keeps the full flow visible in one method. Separate `@action` methods for `_setData()`, `_setError()` would scatter the logic.

**Alternative**: MobX `flow` — used by `LayerTreeStore.fetchLayerTree()`. `flow` is a generator-based alternative that stays in action context across `yield` points. It's more verbose but avoids `runInAction()` wrapping. Both patterns coexist; `@action` + `runInAction` is recommended for new code.

### Reactions: named, with disposal

Every MobX `reaction()` or `autorun()` in a store must:
1. Store its disposer function
2. Have a `name` option for debugging
3. Be disposed in the store's `dispose()` method

**Why**: Unnamed reactions are invisible in MobX devtools. Undisposed reactions leak — they continue firing after the store is "destroyed," referencing stale observables. Explicit disposal prevents this.

Source: `src/core/framework/store/layer/LayerTreeStore.ts` (example: `_dataSourceReaction`)

### SafeDescriptors: true

Prevents accidental redefinition of observable properties via `Object.defineProperty`.

**Why**: A safeguard against a rare but hard-to-debug class of MobX issues where property descriptors conflict with observable annotations. Low cost, high safety.

## Store Map

```
RootStore
├── layerAdapterFactory      LayerAdapterFactory
├── attributeAdapterFactory   AttributeAdapterFactory
├── sourceAdapterFactory      SourceAdapterFactory
├── layerConfigRegistry       LayerConfigRegistry
├── localeStore               LocaleStore          ← no RootStore dependency
├── settingsStore             SettingsStore
├── treeStore                 LayerTreeStore       ← largest: tree + search + panel
├── visibilityStore           LayerVisibilityStore ← depends on treeStore
├── attributeDataStore        AttributeDataStore   ← depends on treeStore + attributeAdapterFactory
├── layerToolStore            ToolStore            ← depends on layerAdapterFactory + layerConfigRegistry
├── mapStore                  MapStore             ← depends on mapToolStore + settingsStore
├── mapToolStore              MapToolStore         ← depends on localeStore + settingsStore
├── catalogStore              WidgetCatalogStore   ← depends on localeStore + settingsStore
├── overlayStore              WidgetOverlayStore   ← depends on catalogStore
├── isInitialized: boolean
└── initError: string | null
```

## Risks / Trade-offs

- **RootStore as service locator** — every store can access every other store. Risk: spaghetti dependencies if unchecked. Mitigation: AGENTS.md rule that stores depend on RootStore, never directly on each other; `rootStore: false` in makeAutoObservable excludes it from tracking.
- **No lazy store loading** — all 10 stores are created at init, even if never used. Trade-off: simpler lifecycle; current store count is manageable.
- **computedRequiresReaction may frustrate debugging** — reading a computed in `console.log` throws. Mitigation: wrap in `autorun(() => console.log(...))` for dev inspection.
- **Only one widget-local store found** (AttributeTableStore). The pattern is documented but lightly used. Trade-off: the mechanism exists; no pressure to use it unless a widget truly needs persistent state.
