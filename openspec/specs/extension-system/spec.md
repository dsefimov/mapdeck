### Requirement: Extension Type Definitions

The system SHALL support four extension types that cover all developer-facing extensibility. Each type SHALL have a distinct purpose, lifecycle, and registration contract.

- **Widget** — a reusable UI panel for displaying information or controls. Rendered as draggable/resizable overlay panels. Registered via `catalogStore.registerWidget()`.
- **Layer Tool** — an action available in a layer's context menu, scoped by the layer's display role. Registered via `layerToolStore.registerTool()`.
- **Map Tool** — a map-wide interaction (measure, basemap switch, compositing). May have persistent state and activate/deactivate lifecycle. Registered via `mapToolStore.registerTool()`.
- **Module** — the primary extension container. A module is a self-contained bundle that MAY provide data sources (via `SourceAdapter`), custom layer roles, widgets, layer tools, map tools, or any combination thereof. Modules SHALL receive `RootStore` injection before registration and SHALL be registered via explicit call in `registerModules()`.

#### Scenario: Widget provides UI panel

- **GIVEN** a developer creates a Widget object with `id: "my-widget"`, a React component, and an icon
- **WHEN** the widget is registered via `catalogStore.registerWidget()`
- **THEN** the widget SHALL appear in the sidebar as a clickable icon
- **THEN** clicking the icon SHALL open the widget's component as a floating panel

#### Scenario: Layer Tool bound to role

- **GIVEN** a developer creates a LayerTool object with `role: "raster"` and a component factory
- **WHEN** the tool is registered via `layerToolStore.registerTool()`
- **WHEN** a user opens the context menu of a layer node with display role `"raster"`
- **THEN** the tool SHALL appear in the context menu

#### Scenario: Map Tool with activate/deactivate lifecycle

- **GIVEN** a developer creates a MapTool class with `id: "my-tool"`, `isActive: false`, and `activate()`/`deactivate()` methods
- **WHEN** the tool is registered via `mapToolStore.registerTool()`
- **WHEN** the system calls `tool.activate(map)`
- **THEN** the tool's `isActive` SHALL transition to `true`
- **WHEN** the system calls `tool.deactivate()`
- **THEN** the tool's `isActive` SHALL transition to `false`

#### Scenario: Module receives RootStore before registration

- **GIVEN** a developer creates a Module class implementing `setRootStore(rootStore)` and `register()`
- **WHEN** the system calls `module.setRootStore(rootStore)` synchronously, then `module.register()` asynchronously
- **THEN** `module.register()` SHALL have access to all stores via `this.rootStore`

### Requirement: Module as Primary Extension Container

The module SHALL be the primary mechanism for delivering additional functionality to the portal. Core SHALL provide only built-in infrastructure (built-in layer tools, built-in widgets, built-in map tools, built-in layer adapters). Any domain-specific functionality — new data sources, custom layer roles, domain-specific widgets, specialized map tools — SHALL be delivered as a module. A module SHALL have the right to internally register any extension type: widgets, layer tools, map tools, source adapters, and custom layer roles.

#### Scenario: Module bundles multiple extension types

- **GIVEN** a developer creates a module for STAC catalog integration
- **WHEN** the module's `register()` method executes
- **THEN** the module MAY register a `SourceAdapter` for fetching STAC collections
- **THEN** the module MAY register custom layer roles via `layerToolStore.registerRole()`
- **THEN** the module MAY register widgets and map tools via `catalogStore` and `mapToolStore`
- **THEN** all registered extensions SHALL be available to the system after `register()` completes

#### Scenario: Built-in extensions vs module-delivered extensions

- **GIVEN** the portal has a set of built-in layer tools (raster opacity, point size, etc.)
- **WHEN** a new domain-specific layer tool is needed (e.g., a spectral index selector for remote sensing)
- **THEN** the new tool SHALL be delivered as part of a module, not added to the built-in set
- **THEN** the built-in set SHALL remain limited to generic, non-domain-specific tools

#### Scenario: Module registers a custom layer role with full rendering support

- **GIVEN** a module for WMS-based geological maps
- **WHEN** the module calls `layerToolStore.registerRole("geology", adapter, defaultConfigFactory)`
- **THEN** the role SHALL be added to the known-roles set
- **THEN** the adapter SHALL be registered for rendering
- **THEN** tools registered for "all" roles SHALL automatically extend to the new role

#### Scenario: Core never imports from modules

- **GIVEN** a module directory at `src/modules/<name>/`
- **WHEN** any file in `src/core/` is compiled
- **THEN** the file SHALL NOT contain any import from `@modules/*` or `src/modules/`
- **THEN** all interaction between core and modules SHALL pass through the extension registration interfaces (stores and factories)

### Requirement: Objects vs Classes Decision Rule

An extension SHALL be implemented as a plain object when it has no mutable state and no lifecycle methods beyond creation. An extension SHALL be implemented as a class when it has observable state (`isActive`, cached data, event listeners) or a lifecycle (`activate`/`deactivate`, `dispose`).

#### Scenario: Stateless extension as object

- **GIVEN** a Widget with only metadata (id, name, icon) and a React component
- **WHEN** the widget is registered
- **THEN** the widget SHALL be a plain object with no lifecycle methods beyond `component`

#### Scenario: Stateful extension as class

- **GIVEN** a MapTool that toggles `isActive`, subscribes to map events, and cleans up on deactivate
- **WHEN** the tool is instantiated at registration time
- **THEN** the tool SHALL be a class instance with MobX-observable state
- **THEN** its `isActive` SHALL be an `observable` boolean field
- **THEN** its `activate()` and `deactivate()` methods SHALL mutate `isActive` and manage event subscriptions

#### Scenario: LayerTool is always an object

- **GIVEN** a LayerTool that renders a control panel for a specific node
- **WHEN** the tool is defined
- **THEN** the tool SHALL be a plain object
- **THEN** the tool SHALL NOT have `isActive` state or lifecycle methods — state is managed by the component internally

### Requirement: Explicit Registration Pattern

Every extension SHALL be registered explicitly in a dedicated `register*.ts` file during app initialization. Registration SHALL use explicit arrays of extension instances — no dynamic discovery, no filesystem scanning, no side-effect imports.

#### Scenario: Extension registered via explicit array

- **GIVEN** a developer creates a new layer tool
- **WHEN** they add it to the `BUILT_IN_TOOLS` array in `src/layer-tools/registerTools.ts`
- **THEN** the tool SHALL be registered on next app initialization

#### Scenario: No implicit registration

- **GIVEN** a developer places a new file in `src/widgets/`
- **WHEN** the app initializes
- **THEN** the file SHALL NOT be automatically registered
- **THEN** an explicit import and array entry in `registerWidgets.ts` SHALL be required

#### Scenario: Duplicate registration of same extension id

- **GIVEN** a widget with id `"my-widget"` is already registered
- **WHEN** another widget with the same id is registered
- **THEN** the duplicate SHALL be silently ignored
- **THEN** the first-registered widget SHALL remain active

### Requirement: Initialization Order Guarantees

The system SHALL initialize extensions in a deterministic order. Layer adapters SHALL be registered first, followed by widgets, layer tools, map tools, and modules. Modules SHALL be registered last, immediately before `fetchLayerTree()`.

#### Scenario: Deterministic init order

- **GIVEN** a fresh portal instance
- **WHEN** `RootStore.initialize()` is called
- **THEN** registration SHALL proceed in this order: layer adapters → widgets → layer tools → map tools → modules → fetchLayerTree → markInitialized
- **THEN** `RootStore.isInitialized` SHALL transition from `false` to `true` after all registrations complete

#### Scenario: Module receives RootStore before other extensions are registered

- **GIVEN** modules are registered after all built-in extensions
- **WHEN** `module.setRootStore(rootStore)` is called
- **THEN** the module SHALL have access to fully populated stores (catalogStore, layerToolStore, mapToolStore, etc.)

#### Scenario: Module registers custom extensions during register()

- **GIVEN** a module that registers a widget and a map tool inside its `register()` method
- **WHEN** the module's `register()` runs
- **THEN** the module SHALL have access to `rootStore.catalogStore.registerWidget()` and `rootStore.mapToolStore.registerTool()`
- **THEN** the registered widget and map tool SHALL be available to the system after `register()` completes

#### Scenario: Init failure marks portal as errored

- **GIVEN** any registration step throws an error
- **WHEN** the error propagates to `RootStore.initialize()`
- **THEN** `RootStore.initError` SHALL be set to a diagnostic message
- **THEN** the App component SHALL render `ErrorScreen` with a retry button
- **THEN** `RootStore.isInitialized` SHALL remain `false`

### Requirement: RootStore as Single Access Point

Every extension within Core access scope SHALL use `RootStore` as the single hub for all stores and services. Components SHALL access it via `useRootStore()`. Stores SHALL receive it as a constructor parameter.

#### Scenario: Component accesses store via hook

- **GIVEN** a React component wrapped in `observer()`
- **WHEN** the component calls `useRootStore()`
- **THEN** the hook SHALL return the singleton `RootStore` instance
- **THEN** the component MAY access any store property (`rootStore.treeStore`, `rootStore.mapStore`, etc.)

#### Scenario: Store receives RootStore at construction

- **GIVEN** a MobX store that needs access to sibling stores
- **WHEN** the store is instantiated in `RootStore`'s constructor
- **THEN** the store SHALL receive `RootStore` via constructor parameter
- **THEN** the store SHALL access sibling stores via `this.rootStore.otherStore`

#### Scenario: Cross-store access prohibition

- **GIVEN** a store that needs data from another store
- **WHEN** the store accesses that data
- **THEN** the store SHALL go through `rootStore.otherStore`, not through a direct import or singleton reference

### Requirement: Extension Lifecycle Boundaries

Each extension type SHALL have a specific lifecycle contract. State surviving open/close cycles SHALL be managed through the extension's designated state mechanism, not through React component state.

#### Scenario: Widget state survives close/reopen

- **GIVEN** a widget is opened, the widget component modifies some filter state via its local store, then the widget is closed
- **WHEN** the widget is opened again
- **THEN** the filter state SHALL be preserved
- **THEN** the state SHALL be retrieved via `overlayStore.getWidgetStore(widgetId, factory)`

#### Scenario: MapTool state persists across activate/deactivate

- **GIVEN** a map tool with measurement data accumulated during its active session
- **WHEN** the tool is deactivated and later reactivated
- **THEN** the tool's instance SHALL persist (tools are created once at registration)
- **THEN** the measurement data SHALL be preserved unless explicitly cleared by the tool's own logic

#### Scenario: LayerTool has no persistent state

- **GIVEN** a layer tool receives a `nodeId` for each invocation
- **WHEN** the tool's panel is closed and reopened for a different node
- **THEN** the panel SHALL render with the new node's configuration
- **THEN** no state from the previous invocation SHALL carry over
