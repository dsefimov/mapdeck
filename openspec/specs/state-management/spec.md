### Requirement: MobX Configuration Enforcement

The system SHALL configure MobX with three strict runtime guarantees. `enforceActions: "always"` SHALL prevent observable mutations outside `@action`-decorated methods. `computedRequiresReaction: true` SHALL throw if a computed value is read outside a reactive context (`observer`, `autorun`, `reaction`, or another computed). `safeDescriptors: true` SHALL prevent accidental redefinition of observable properties.

#### Scenario: Mutation outside action throws

- **GIVEN** a store with an observable field `value`
- **WHEN** code attempts to assign `this.value = newValue` outside an `@action` method
- **THEN** MobX SHALL throw an error

#### Scenario: Computed read outside reactive context throws

- **GIVEN** a store with a `@computed` getter
- **WHEN** code reads the computed value outside `observer()`, `autorun()`, `reaction()`, or another computed
- **THEN** MobX SHALL throw an error

#### Scenario: Computed read inside observer succeeds

- **GIVEN** a component wrapped in `observer()` and a store with a `@computed` getter
- **WHEN** the component renders and reads the computed value
- **THEN** no error SHALL be thrown
- **THEN** the component SHALL re-render when the computed value changes

### Requirement: Global Store Lifecycle

Global stores SHALL be created once in the `RootStore` constructor. They SHALL live for the entire application lifecycle. The creation order SHALL be deterministic and documented. A global store SHALL receive `RootStore` via constructor injection. The `RootStore` reference in a store SHALL be marked `readonly` and excluded from MobX observability tracking.

#### Scenario: Global stores created once

- **GIVEN** a new `RootStore` is instantiated
- **WHEN** the constructor runs
- **THEN** all stores declared in RootStore's constructor SHALL be created
- **THEN** each store SHALL receive the same `RootStore` instance via its constructor

#### Scenario: Store constructor receives RootStore

- **GIVEN** a global store class with `constructor(readonly rootStore: RootStore)`
- **WHEN** the store is instantiated inside RootStore's constructor
- **THEN** the store SHALL store the RootStore reference
- **THEN** the `rootStore` field SHALL be excluded from MobX observability via `makeAutoObservable(this, { rootStore: false })`

#### Scenario: Store creation order

- **GIVEN** a fresh `RootStore` instantiation
- **WHEN** the constructor runs
- **THEN** adapter factories SHALL be created first
- **THEN** `LocaleStore` SHALL be created before `SettingsStore`
- **THEN** `SettingsStore` SHALL be created before other stores
- **THEN** stores that depend on other stores (e.g. `LayerVisibilityStore` depends on `treeStore`) SHALL be created after their dependencies

### Requirement: Local Store Lifecycle

Local stores SHALL be created on-demand via `WidgetOverlayStore.getWidgetStore(id, factory)`. The factory SHALL be called only on first access. The created store SHALL persist across widget open/close cycles and SHALL be destroyed only on explicit removal.

#### Scenario: Local store created on first access

- **GIVEN** no local store exists for widget `"my-widget"`
- **WHEN** `overlayStore.getWidgetStore("my-widget", () => new MyStore(rootStore))` is called
- **THEN** the factory SHALL be invoked and a new store SHALL be created
- **THEN** the store SHALL be cached under the key `"my-widget"`

#### Scenario: Local store survives close/reopen

- **GIVEN** a local store was created for widget `"my-widget"` with some mutable state
- **WHEN** the widget is closed and later reopened
- **WHEN** `getWidgetStore("my-widget", factory)` is called again
- **THEN** the factory SHALL NOT be called a second time
- **THEN** the previously created store SHALL be returned with its state preserved

#### Scenario: Local store removed on dispose

- **GIVEN** a local store exists for widget `"my-widget"`
- **WHEN** `overlayStore.removeWidgetStore("my-widget")` is called
- **THEN** the store SHALL be removed from the cache
- **WHEN** `getWidgetStore("my-widget", factory)` is called next
- **THEN** the factory SHALL be invoked and a fresh store SHALL be created

### Requirement: Initialization State Contract

The system SHALL expose `isInitialized: boolean` and `initError: string | null` on `RootStore`. Before initialization, `isInitialized` SHALL be `false`. On successful initialization, `isInitialized` SHALL transition to `true` after all registrations and the first layer tree fetch complete. On initialization failure, `initError` SHALL be set and `isInitialized` SHALL remain `false`.

#### Scenario: Initial state before initialization

- **GIVEN** a fresh `RootStore` instance
- **WHEN** no initialization has been attempted
- **THEN** `isInitialized` SHALL be `false`
- **THEN** `initError` SHALL be `null`

#### Scenario: Successful initialization

- **GIVEN** `RootStore.initialize()` is called
- **WHEN** all registration steps complete successfully and `fetchLayerTree()` resolves
- **THEN** `isInitialized` SHALL be `true`
- **THEN** the App component SHALL transition from `LoadingScreen` to `MapWorkspace`

#### Scenario: Initialization failure

- **GIVEN** any registration step or `fetchLayerTree()` throws an error
- **WHEN** `RootStore.initialize()` catches the error
- **THEN** `initError` SHALL be set to a non-null diagnostic message
- **THEN** `isInitialized` SHALL remain `false`
- **THEN** the App component SHALL render `ErrorScreen` with a retry option

#### Scenario: isInitialized transition is atomic

- **GIVEN** initialization is in progress (some stores registered, others not)
- **WHEN** a component reads `isInitialized`
- **THEN** the value SHALL be `false` (not `undefined` or an intermediate state)
- **THEN** `isInitialized` SHALL only become `true` after ALL registrations complete

### Requirement: Store Disposal

Every global store SHALL provide a `dispose()` method that cleans up its resources. Calling `dispose()` on a store SHALL cancel its reactions, abort pending requests, and release external references. After disposal, the store SHALL NOT produce side effects.

#### Scenario: Reaction disposed

- **GIVEN** a store has set up a MobX `reaction()` with a stored disposer function
- **WHEN** `store.dispose()` is called
- **THEN** the reaction disposer SHALL be invoked
- **THEN** the reaction SHALL no longer fire on observable changes

#### Scenario: Abort controllers released

- **GIVEN** a store has pending fetch requests with `AbortController` instances
- **WHEN** `store.dispose()` is called
- **THEN** all pending `AbortController`s SHALL be aborted

#### Scenario: Disposal of already-disposed store is safe

- **GIVEN** `store.dispose()` was already called once
- **WHEN** `store.dispose()` is called again
- **THEN** no error SHALL be thrown
- **THEN** no side effects SHALL occur

### Requirement: No Cross-Store Dispose

A store SHALL NOT call `dispose()` on a sibling store. Only `RootStore` SHALL coordinate cross-store disposal. Each store's `dispose()` method SHALL clean up only its own resources: reactions, abort controllers, event listeners, and subscriptions. If store A depends on store B for cleanup coordination, `RootStore` SHALL orchestrate the order.

#### Scenario: Store disposes only its own resources

- **GIVEN** a store has set up reactions, abort controllers, and event listeners
- **WHEN** `store.dispose()` is called
- **THEN** it SHALL dispose its own reactions, abort controllers, and listeners
- **THEN** it SHALL NOT call `dispose()` on any other store

#### Scenario: RootStore orchestrates multi-store disposal

- **GIVEN** `RootStore` has multiple global stores
- **WHEN** `rootStore.dispose()` is called
- **THEN** each store's `dispose()` SHALL be called in reverse construction order
- **THEN** no store SHALL call another store's `dispose()` directly

### Requirement: Local Store Patterns

The system SHALL support three local-store patterns. **Pattern A (widget-local)**: stores created via `WidgetOverlayStore.getWidgetStore(id, factory)` — for widget-scoped state that persists across open/close cycles. **Pattern B (tool-owned)**: stores instantiated directly by a map tool — for measurement or interaction state that lives for the tool's activation lifetime. **Pattern C (inline observable)**: observable fields declared directly on a tool class — for minimal state that does not warrant a separate store class.

#### Scenario: Widget-local store via getWidgetStore

- **GIVEN** a widget that needs to remember filter state across close/reopen
- **WHEN** the widget creates its store via `overlayStore.getWidgetStore(widgetId, () => new FilterStore(rootStore))`
- **THEN** the store SHALL be cached under `widgetId` and survive `closeWidget()` → `openWidget()` cycles

#### Scenario: Tool-owned store for measurement

- **GIVEN** a map tool that collects measurement points during interaction
- **WHEN** the tool is activated
- **THEN** it SHALL instantiate a `MeasureToolStore` to hold points, preview state, and edit mode
- **WHEN** the tool is deactivated
- **THEN** the store's state SHALL be reset via `store.reset()`

#### Scenario: Inline observable for simple tool state

- **GIVEN** a map tool that only needs an `isActive` flag and a single counter
- **WHEN** the tool is implemented
- **THEN** the state SHALL be declared as `observable` fields directly on the tool class
- **THEN** no separate store class SHALL be created — the overhead is not warranted for two fields

### Requirement: Cross-Store Access Rule

A store SHALL NOT import another store class directly. All cross-store access SHALL go through `rootStore.otherStore`. This rule SHALL be enforced by convention and code review.

#### Scenario: Store accesses sibling via RootStore

- **GIVEN** `LayerVisibilityStore` needs to read tree data from `LayerTreeStore`
- **WHEN** the visibility store accesses `this.rootStore.treeStore`
- **THEN** the access SHALL succeed and return the `LayerTreeStore` instance

#### Scenario: Store does not import sibling store class

- **GIVEN** the file `LayerVisibilityStore.ts`
- **WHEN** the file is compiled or linted
- **THEN** the file SHALL NOT contain an import from `./LayerTreeStore` or any path resolving to another store file

#### Scenario: No circular store dependencies

- **GIVEN** a cycle would be formed if store A imports store B and store B imports store A
- **WHEN** all store files are analyzed
- **THEN** no such cycle SHALL exist — all store-to-store dependencies SHALL be mediated through `RootStore`
