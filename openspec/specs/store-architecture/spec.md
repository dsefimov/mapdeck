# Store Architecture

**Purpose:** Comprehensive guide to the store system — per-store responsibilities, store selection by task, store type classification, and extension patterns. This is the single entry point for developers asking "where does my state go?"

## Requirements

### Requirement: Store Responsibility Map

The system SHALL document every global store with its responsibility, owned state, key methods, dependencies, and consumers. The following stores SHALL exist in `RootStore`:

**Adapter factories** (created first, before any store):

| Store | Responsibility | Key state / methods | Depends on |
|---|---|---|---|
| `layerAdapterFactory: LayerAdapterFactory` | Maps display roles to rendering adapters | `register(role, adapter)`, `get(role)` | — |
| `attributeAdapterFactory: AttributeAdapterFactory` | Maps attribute roles to data adapters | `register(role, adapter)`, `get(role)` | — |
| `sourceAdapterFactory: SourceAdapterFactory` | Registry of tree data source adapters | `register(id, adapter)`, `getDefault()`, `hasDefault()` | — |
| `layerConfigRegistry: LayerConfigRegistry` | Default config factories per display role | `register(role, factory)` | — |

**Global stores** (created in dependency order):

| Store | Responsibility | Key state | Key methods | Depends on via rootStore | Consumed by |
|---|---|---|---|---|---|
| `localeStore: LocaleStore` | Current language and namespace-based translation dictionaries | `currentLang`, `_translations`, `_currentDictMap` | `registerTranslations(ns, dict)`, `t(ns)`, `setLanguage(lang)` | (none — receives RootStore but no store dependency) | All extensions, UI components |
| `settingsStore: SettingsStore` | Key-value registry of user-configurable settings with type validation | `_settings: Map<string, RegisteredSetting>` | `registerSetting(owner, name, meta)`, `getStringSetting(id)`, `setSetting(id, value)`, `resetSetting(id)` | (none) | All extensions, MapStore (basemap), LayerTreeStore (data source URL) |
| `treeStore: LayerTreeStore` | Layer tree hierarchy, search, panel open/close state | `_nodes`, `rootIds`, `loading`, `error`, `searchQuery`, `openPanelNodeId` | `fetchLayerTree()`, `getNode(id)`, `loadChildren(id)`, `searchTree(q)`, `layerNodes`, `layerSnapshot`, `togglePanel(id)` | `settingsStore`, `sourceAdapterFactory`, `visibilityStore` (via `rootStore.visibility`) | Widgets, layer tools, map tools, rendering pipeline |
| `visibilityStore: LayerVisibilityStore` | Layer visibility toggling and extent caching | `_extentCache`, `_visibilityTasks` | `toggleCollectionVisible(id, visible)`, `toggleItemVisible(id, visible)`, `getCombinedExtent(id)`, `clearExtentCache(id)` | `treeStore` (via `rootStore.treeStore`) | Widgets, context menu, zoom-to-extent |
| `attributeDataStore: AttributeDataStore` | Caching layer for attribute data fetches with pagination and TTL | `cache: Map<string, AttributeCacheEntry>`, `controllers: Map<string, AbortController>` | `fetch(nodeId, options)`, `getCache(nodeId, sort?)`, `clearCache(nodeId?)`, `isLoading(nodeId)` | `treeStore`, `attributeAdapterFactory` | `AttributeTableStore` (widget-local), data export tools |
| `layerToolStore: ToolStore` | Registry of layer tools organized by display role | `layerTools: Map<LayerRole, LayerTool[]>`, `_knownRoles: Set<LayerRole>` | `registerRole(role, adapter, config)`, `registerTool(tool)`, `getLayerTools(role)` | `layerAdapterFactory`, `layerConfigRegistry` | Modules, context menu renderer |
| `mapStore: MapStore` | MapLibre GL map instance lifecycle, deck.gl overlay, basemap management | `map`, `overlayManager`, `layerManager`, `_basemapConfigs` | `initializeMap(container)`, `setMap(map)`, `zoomToExtent(bbox)`, `context` (computed), `applyBasemapToMap(config)` | `mapToolStore`, `settingsStore` | Widgets, map tools, rendering pipeline |
| `mapToolStore: MapToolStore` | Registry and activation state of map interaction tools | `tools: Map<string, AnyMapTool>`, `activeToolId`, `_pendingPoint` | `registerTool(tool)`, `activateTool(id)`, `deactivateTool()`, `toggleTool(id)`, `executeTool(id)` | `localeStore`, `settingsStore` | Map UI (tool buttons), context menu |
| `catalogStore: WidgetCatalogStore` | Widget registry with lifecycle hooks (initialize/destroy) | `_widgets: Map<string, Widget>` | `registerWidget(widget)`, `unregisterWidget(id)`, `getWidgetById(id)`, `hasWidget(id)` | `localeStore`, `settingsStore` | Sidebar, modules, `WidgetOverlayStore` |
| `overlayStore: WidgetOverlayStore` | Widget open/close state, grid layout, z-order, and widget-local store hosting | `_openWidgets`, `_widgetStores` | `openWidget(id)`, `closeWidget(id)`, `getWidgetStore(id, factory)`, `bringToFront(id)`, `syncLayout(items)` | `catalogStore` | Widget panels, grid renderer, widget-local stores |

#### Scenario: Developer finds the right store for tree data

- **GIVEN** a developer needs to access the layer tree hierarchy
- **WHEN** they consult the store responsibility map
- **THEN** they SHALL be directed to `treeStore` (owns tree nodes, search, panel state; depends on `settingsStore` and `sourceAdapterFactory`; consumed by widgets, layer tools, and map tools)

#### Scenario: Developer finds the right store for user preferences

- **GIVEN** a developer needs to store a user-configurable setting
- **WHEN** they consult the store responsibility map
- **THEN** they SHALL be directed to `settingsStore` (owns registered settings key-value store; depends on nothing; consumed by all extensions)

#### Scenario: Every store is listed

- **GIVEN** the store responsibility map
- **WHEN** the map is compared against all stores created in `RootStore`'s constructor
- **THEN** every global store SHALL have a documented entry

### Requirement: Store Selection Guide

The system SHALL provide a decision guide for choosing the correct store for common development tasks. The guide SHALL be organized by task category: layer data, user preferences, widget state, map interaction, localization, extension registration.

#### Scenario: Developer wants to access layer data

- **GIVEN** a developer needs to read or modify layer tree data
- **WHEN** they consult the store selection guide under "layer data"
- **THEN** the guide SHALL direct them to `LayerTreeStore` for tree structure, `LayerVisibilityStore` for visibility toggling, and `AttributeDataStore` for fetching feature attributes

#### Scenario: Developer wants to open a widget

- **GIVEN** a developer needs to open or close a widget programmatically
- **WHEN** they consult the store selection guide under "widget state"
- **THEN** the guide SHALL direct them to `WidgetOverlayStore.openWidget()` / `closeWidget()`, and `WidgetCatalogStore` for widget registration or lookup

#### Scenario: Developer wants to register an extension

- **GIVEN** a developer is writing a module's `register()` method
- **WHEN** they need to register a widget, tool, or adapter
- **THEN** the guide SHALL direct them to the corresponding store: `WidgetCatalogStore.registerWidget()`, `MapToolStore.registerTool()`, `ToolStore.registerTool()`, or `SourceAdapterFactory.register()`

### Requirement: Store Type Classification

The system SHALL classify stores into three types. **Global stores** SHALL be created once in `RootStore` and live for the application lifetime. **Widget-local stores** SHALL be created on-demand via `WidgetOverlayStore.getWidgetStore()` and SHALL persist across widget open/close cycles. **Tool-owned stores** SHALL be instantiated by individual map tools or layer tools and SHALL be disposed when the tool deactivates.

#### Scenario: Global store lifecycle

- **GIVEN** a global store (e.g., `LayerTreeStore`, `SettingsStore`)
- **WHEN** the application initializes
- **THEN** the store SHALL be created in `RootStore`'s constructor
- **WHEN** the application is torn down
- **THEN** the store SHALL be disposed via `RootStore.dispose()`

#### Scenario: Widget-local store lifecycle

- **GIVEN** a widget that needs persistent local state (filters, sort order, selection)
- **WHEN** the widget is first opened
- **THEN** a widget-local store SHALL be created via `overlayStore.getWidgetStore(id, factory)`
- **WHEN** the widget is closed and reopened
- **THEN** the same store instance SHALL be returned with its state preserved
- **WHEN** the widget is unregistered
- **THEN** `overlayStore.removeWidgetStore(id)` SHALL be called to destroy the store

#### Scenario: Tool-owned store lifecycle

- **GIVEN** a map tool (e.g., ruler, area measure) that needs measurement state
- **WHEN** the tool is activated
- **THEN** the tool SHALL instantiate its store (e.g., `new MeasureToolStore()`)
- **WHEN** the tool is deactivated
- **THEN** the tool SHALL reset or dispose its store

### Requirement: Store Extension Pattern

The system SHALL define patterns for adding new stores. A new global store SHALL be instantiated in `RootStore`'s constructor and receive `RootStore` via constructor injection. A new widget-local store SHALL be created via `WidgetOverlayStore.getWidgetStore()` and receive `RootStore` in its constructor. A new tool-owned store SHALL be instantiated by its owning tool.

#### Scenario: Adding a new global store

- **GIVEN** a developer needs to introduce a new global store (e.g., `AnnotationStore`)
- **WHEN** they follow the extension pattern
- **THEN** they SHALL create the store class with `constructor(readonly rootStore: RootStore)` and `makeAutoObservable(this, { rootStore: false })`
- **THEN** they SHALL instantiate it in `RootStore`'s constructor after its dependencies
- **THEN** they SHALL implement a `dispose()` method that cleans up reactions and abort controllers

#### Scenario: Adding a new widget-local store

- **GIVEN** a developer's widget needs persistent state across open/close cycles
- **WHEN** they follow the extension pattern
- **THEN** they SHALL create a store class accepting `RootStore` in its constructor
- **THEN** they SHALL use `overlayStore.getWidgetStore(widgetId, () => new MyStore(rootStore))` to obtain or create the instance
- **THEN** the widget's React component SHALL read from the store via `observer()`, not via `useState`

#### Scenario: Widget that does not need persistent state

- **GIVEN** a widget whose state is fully derived from global stores and has no local filters or selections
- **WHEN** the widget is implemented
- **THEN** the widget SHALL NOT create a local store — it SHALL read directly from global stores via `rootStore`
