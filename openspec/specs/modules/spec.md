### Requirement: Module Interface

A module SHALL implement the `Module<TConfig>` interface. The interface SHALL require `id` (unique string), `name` (human-readable), `setRootStore(rootStore)` (synchronous, called before `register`), and `register(config?)` (async, called after all built-in registrations complete). A module MAY be implemented as a class if it has state, or as an object if stateless. See `openspec/specs/extension-system/` for the Objects vs Classes decision rule.

#### Scenario: Module receives RootStore before registration

- **GIVEN** a module with `setRootStore(rootStore)` and `register()`
- **WHEN** the system calls `module.setRootStore(rootStore)` synchronously, then `module.register()` asynchronously
- **THEN** `module.register()` SHALL have access to all stores via `this.rootStore`

#### Scenario: Module with configuration

- **GIVEN** a module implementing `Module<MyConfig>` with `register(config?: MyConfig)`
- **WHEN** the module is registered with a config object
- **THEN** `register(config)` SHALL receive the config value

#### Scenario: Module without configuration

- **GIVEN** a module implementing `Module<void>` with `register()`
- **WHEN** the module is registered without a config
- **THEN** `register()` SHALL be called with no arguments

### Requirement: Source Adapter Contract

A data source module SHALL provide a `SourceAdapter` for converting external data into `TreeNode[]` with `NodeRoles`. The adapter SHALL implement `fetchTree()` returning `Promise<TreeNode[]>`. The method SHALL be called by the tree store on layer tree fetch, not reactively. On data source unavailability, the adapter SHALL return an empty array — not throw. The adapter SHALL be registered via `rootStore.sourceAdapterFactory.register(id, adapter)`. Core SHALL know nothing about the external data format — the module's mapper handles all translation. See `openspec/specs/node-roles/` for the NodeRole system.

#### Scenario: Module provides a SourceAdapter

- **GIVEN** a module for STAC catalog integration
- **WHEN** the module's `register()` method calls `rootStore.sourceAdapterFactory.register("stac", adapter)`
- **THEN** the adapter SHALL be available for tree data fetching

#### Scenario: SourceAdapter returns TreeNode[] with roles

- **GIVEN** a SourceAdapter's `fetchTree()` method
- **WHEN** it returns nodes with `NodeRoles` containing display, attribute, and report roles
- **THEN** the tree store SHALL store the nodes
- **THEN** the rendering pipeline SHALL create map layers for nodes with display roles

#### Scenario: Core never imports from module internals

- **GIVEN** a module directory at `src/modules/<name>/`
- **WHEN** any file in `src/core/` is compiled
- **THEN** the file SHALL NOT contain any import from `@modules/<name>/` or `src/modules/<name>/`
- **THEN** all interaction SHALL pass through the `registerModules()` function

#### Scenario: SourceAdapter returns empty array on failure

- **GIVEN** a SourceAdapter whose external data source is unreachable
- **WHEN** `fetchTree()` is called
- **THEN** the adapter SHALL return an empty array — not throw
- **THEN** the layer tree SHALL be empty for that source

### Requirement: Custom Role Registration

A module MAY register custom layer roles via `layerToolStore.registerRole(role, adapter, defaultConfigFactory)`. This SHALL register the role in the known-roles set, register the adapter for rendering, and provide a default config factory. Tools registered for "all" roles SHALL automatically extend to the new role if registered after the role.

#### Scenario: Module registers a custom role

- **GIVEN** a module for WMS geological maps
- **WHEN** the module calls `layerToolStore.registerRole("geology", adapter, () => defaultConfig)`
- **THEN** the role `"geology"` SHALL be added to the known-roles set
- **THEN** the adapter SHALL be registered in `layerAdapterFactory`
- **THEN** the default config factory SHALL be registered in `layerConfigRegistry`

#### Scenario: Custom role requires config type extension

- **GIVEN** a module defines a custom role with a custom config type
- **WHEN** the module extends `LayerConfigRegistry` via declaration merging
- **THEN** the custom config type SHALL be usable wherever `LayerConfigFor<"custom-role">` is resolved

### Requirement: Module Can Register Any Extension Type

A module MAY register any extension type during its `register()` method: widgets, layer tools, map tools, source adapters, and custom layer roles. Modules SHALL have access to all registration stores via RootStore.

#### Scenario: Module registers a widget

- **GIVEN** a module that provides a custom widget
- **WHEN** the module calls `rootStore.catalogStore.registerWidget(myWidget)` inside `register()`
- **THEN** the widget SHALL be registered and appear in the sidebar

#### Scenario: Module registers a map tool

- **GIVEN** a module that provides a domain-specific map tool
- **WHEN** the module calls `rootStore.mapToolStore.registerTool(myTool)` inside `register()`
- **THEN** the tool SHALL appear in the map tools list

#### Scenario: Module registers multiple extension types

- **GIVEN** a module that provides a SourceAdapter, a custom role, and a widget
- **WHEN** the module's `register()` executes
- **THEN** all three SHALL be registered successfully
- **THEN** the system SHALL have access to the data source, the custom role, and the widget

### Requirement: Module Init Order Guarantees

Modules SHALL be registered last in the initialization sequence, after all built-in extensions are registered and before `fetchLayerTree()`. Each module SHALL receive `setRootStore(rootStore)` synchronously before its async `register()` is called.

#### Scenario: All built-in registrations complete before modules

- **GIVEN** a fresh portal instance starting initialization
- **WHEN** `RootStore.initialize()` is called
- **THEN** built-in layer adapters, widgets, layer tools, and map tools SHALL be registered before `registerModules()` is called

#### Scenario: Module's register can use fully populated stores

- **GIVEN** the init order guarantees modules are registered after built-in extensions
- **WHEN** a module's `register()` runs
- **THEN** `rootStore.catalogStore`, `rootStore.layerToolStore`, `rootStore.mapToolStore`, and `rootStore.settingsStore` SHALL all be fully populated

#### Scenario: fetchLayerTree runs after all modules

- **GIVEN** one or more modules register source adapters
- **WHEN** all modules have completed `register()`
- **THEN** `fetchLayerTree()` SHALL be called
- **THEN** the fetch SHALL have access to all registered source adapters

#### Scenario: Module register failure does not block other modules

- **GIVEN** three modules are being registered, and the second module's `register()` throws an error
- **WHEN** the error propagates
- **THEN** the remaining modules SHALL still be registered
- **THEN** `fetchLayerTree()` SHALL still be called with source adapters from successful modules
- **THEN** the portal SHALL complete initialization — one module's failure SHALL NOT block initialization

### Requirement: Directory Structure

A module SHALL be placed in `src/modules/<module-name>/`. Internal organization SHALL follow the convention: `adapter/` for SourceAdapter, `core/` for internal logic, `mapping/` for data-to-roles translation, `module/` for the Module class.

#### Scenario: Data source module directory structure

- **GIVEN** a module for STAC catalog integration
- **WHEN** the directory is created
- **THEN** `adapter/` SHALL contain the SourceAdapter
- **THEN** `module/` SHALL contain the Module class
- **THEN** `mapping/` SHALL contain external-to-NodeRole translation logic
