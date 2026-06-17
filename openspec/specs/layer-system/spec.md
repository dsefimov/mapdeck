### Requirement: Display Role Definition

The system SHALL define a set of display roles that determine how a layer renders on the map. A display role is a unique string identifier. The system SHALL include four built-in roles: `"raster"`, `"vector"`, `"point-cloud"`, and `"geojson"`. Modules MAY define additional roles via a factory function. For the data model of how roles attach to tree nodes, see `openspec/specs/node-roles/`.

#### Scenario: Built-in roles available

- **GIVEN** a fresh portal instance with no modules loaded
- **WHEN** the system resolves the set of known display roles
- **THEN** the set SHALL contain `"raster"`, `"vector"`, `"point-cloud"`, and `"geojson"`

#### Scenario: Module defines a custom role

- **GIVEN** a developer creates a module that calls the role factory with `"custom-type"`
- **WHEN** the module creates tree nodes carrying that role
- **THEN** the system SHALL accept the role as a valid display role identifier

#### Scenario: Role identifier is type-safe

- **GIVEN** a developer passes a plain string where a display role is expected
- **WHEN** the code is type-checked during compilation
- **THEN** the compiler SHALL reject the plain string (roles are branded values, not arbitrary strings)

### Requirement: Layer Configuration

The system SHALL provide a configuration structure for each display role. Every configuration SHALL carry the role as a discriminator field. Every configuration SHALL support an opacity value (0.0 to 1.0, default 1.0) and a visibility flag (default true).

#### Scenario: Raster configuration

- **GIVEN** a layer has role `"raster"`
- **WHEN** a configuration is created with default values
- **THEN** the configuration SHALL include fields for source type (`"xyz"`, `"wms"`, or `"cog"`), a URL, and paint properties for tile rendering

#### Scenario: Vector configuration

- **GIVEN** a layer has role `"vector"`
- **WHEN** a configuration is created with default values
- **THEN** the configuration SHALL include a layer type field (`"fill"`, `"line"`, `"circle"`, or `"symbol"`), paint properties (fill color, line color, opacity), and layout properties

#### Scenario: Point cloud configuration

- **GIVEN** a layer has role `"point-cloud"`
- **WHEN** a configuration is created with default values
- **THEN** the configuration SHALL include point size (default 1), color scheme (default RGB), and optional intensity and classification filter fields

#### Scenario: GeoJSON configuration

- **GIVEN** a layer has role `"geojson"`
- **WHEN** a configuration is created with default values
- **THEN** the configuration SHALL include a layer type field (`"fill"`, `"line"`, `"circle"`, or `"symbol"`, default `"fill"`) and paint properties

#### Scenario: Configuration discriminated by role

- **GIVEN** a configuration with role `"raster"` and a configuration with role `"vector"`
- **WHEN** the system resolves the configuration type by role discriminator
- **THEN** each configuration SHALL expose only the fields relevant to its role

#### Scenario: Configuration missing for unknown role

- **GIVEN** a module registers a custom role but provides no default configuration
- **WHEN** the system attempts to create a configuration for that role
- **THEN** the operation SHALL fail with a diagnostic message

### Requirement: Render Descriptor

The system SHALL use a render descriptor as the single source of truth for map rendering. A descriptor SHALL bundle the display role, the data source URL, and the role-specific configuration into one immutable object.

#### Scenario: Descriptor creation

- **GIVEN** a role `"raster"`, a source URL, and a valid configuration
- **WHEN** a descriptor is created
- **THEN** the descriptor SHALL contain the role, source URL, and configuration as a single unit

#### Scenario: Immutable config update

- **GIVEN** a descriptor with opacity set to `1.0`
- **WHEN** a config update is applied to change opacity to `0.5`
- **THEN** the operation SHALL return a new descriptor with opacity `0.5`
- **THEN** the original descriptor SHALL be unchanged

#### Scenario: Descriptor with missing source URL

- **GIVEN** a descriptor is created with an empty source URL
- **WHEN** the rendering pipeline processes the descriptor
- **THEN** the system SHALL NOT create a map layer for that descriptor

### Requirement: Layer Adapter

The system SHALL provide a rendering adapter interface with four methods: adding a layer to the map, removing a layer, updating visibility, and applying configuration changes. Each adapter SHALL declare which display role it handles. All adapter methods SHALL receive a map context providing access to the map instance and overlay manager.

#### Scenario: Adapter adds a layer

- **GIVEN** an adapter for role `"raster"` and a valid descriptor
- **WHEN** the adapter's add-to-map method is called with a layer identifier, the descriptor, and map context
- **THEN** a raster tile layer SHALL appear on the map

#### Scenario: Adapter removes a layer

- **GIVEN** a layer previously added to the map via an adapter
- **WHEN** the adapter's remove-from-map method is called with the layer identifier
- **THEN** the layer SHALL be removed from the map

#### Scenario: Adapter updates visibility

- **GIVEN** a visible layer on the map
- **WHEN** the adapter's update-visibility method is called with `visible: false`
- **THEN** the layer SHALL become hidden on the map

#### Scenario: Adapter applies config update

- **GIVEN** a layer on the map with opacity `1.0`
- **WHEN** the adapter's update-config method is called with a new configuration containing opacity `0.3`
- **THEN** the layer SHALL reflect the new opacity value
- **THEN** the adapter SHALL ensure the final rendered state matches the new config — whether by in-place update or by remove+add is an adapter's choice

#### Scenario: Adapter role mismatch on registration

- **GIVEN** an adapter whose role field is `"raster"`
- **WHEN** the adapter is registered for role `"vector"`
- **THEN** the registration SHALL fail with a diagnostic message

#### Scenario: No adapter for role

- **GIVEN** a role `"custom"` has no registered adapter
- **WHEN** the system attempts to resolve an adapter for that role
- **THEN** the operation SHALL fail with a diagnostic message

### Requirement: Render Unit

The system SHALL group one or more tree nodes into render units for map rendering. A render unit SHALL carry a unique identifier, the list of node identities it represents, an adapter, and a descriptor. A single layer produces a render unit with one node identity. Multiple WMS layers of the same source MAY be grouped into a single render unit with multiple node identities.

#### Scenario: Single-layer render unit

- **GIVEN** a visible tree node with a valid descriptor and a registered adapter for its role
- **WHEN** the system builds render units from the tree snapshot
- **THEN** a render unit SHALL be created with the node's identity, descriptor, and adapter

#### Scenario: Invisible node produces no render unit

- **GIVEN** a tree node with `isVisible` set to `false`
- **WHEN** the system builds render units
- **THEN** no render unit SHALL be created for that node

#### Scenario: Node without descriptor produces no render unit

- **GIVEN** a tree node whose descriptor is null
- **WHEN** the system builds render units
- **THEN** no render unit SHALL be created for that node

#### Scenario: Node with unregistered role produces no render unit

- **GIVEN** a visible tree node with a valid descriptor but no adapter registered for its role
- **WHEN** the system builds render units
- **THEN** no render unit SHALL be created for that node

### Requirement: Map Context

The system SHALL provide a map context to every adapter method. The map context SHALL carry a reference to the map instance and to the overlay manager. The map context SHALL be read-only.

#### Scenario: Context provides map and overlay

- **GIVEN** a map has been initialized with an overlay manager
- **WHEN** the system creates a map context
- **THEN** the context SHALL expose the map instance and the overlay manager
- **THEN** both references SHALL be non-null when the map is ready

### Requirement: Layer Manager Reactive Sync

The system SHALL maintain a reactive synchronization loop between the tree state and the map. The layer manager SHALL observe changes to the tree snapshot and reconcile the map state to match. The reconciliation SHALL minimize map mutations: layers already on the map SHALL be updated in-place when possible; new layers SHALL be added; removed layers SHALL be cleaned up.

#### Scenario: New node appears in snapshot

- **GIVEN** the map currently shows no layers
- **WHEN** a new tree node with a valid descriptor appears in the snapshot
- **THEN** the layer manager SHALL create a render unit and add it to the map

#### Scenario: Node removed from snapshot

- **GIVEN** the map currently shows a layer for a tree node
- **WHEN** the node is removed from the snapshot
- **THEN** the layer manager SHALL remove the corresponding layer from the map

#### Scenario: Node config changes

- **GIVEN** the map currently shows a raster layer at opacity `1.0`
- **WHEN** the node's descriptor config changes to opacity `0.5`
- **THEN** the layer manager SHALL call the adapter's update-config method with the new descriptor
- **THEN** the rendered layer SHALL reflect opacity `0.5` — whether the adapter achieves this in-place or by remove+add is the adapter's choice

#### Scenario: Reactive sync is debounced

- **GIVEN** multiple tree node changes occur within a short interval
- **WHEN** the layer manager's reactive reaction fires
- **THEN** the layer manager SHALL reconcile all changes in a single synchronization pass
- **THEN** the map SHALL reflect the final state, not intermediate states

#### Scenario: Map not yet loaded

- **GIVEN** the map instance has not yet fired its load event
- **WHEN** tree nodes appear in the snapshot
- **THEN** the layer manager SHALL defer layer creation until the map load event fires
- **WHEN** the map load event fires
- **THEN** the layer manager SHALL immediately process all pending nodes

### Requirement: Adapter Factory

The system SHALL provide a factory that maps display roles to adapter instances. Registration SHALL be async and SHALL validate that the adapter's declared role matches the registration role. Retrieval SHALL fail with a diagnostic message when no adapter is registered for the requested role.

#### Scenario: Adapter registered and retrieved

- **GIVEN** a raster adapter claiming role `"raster"`
- **WHEN** the adapter is registered for role `"raster"` and then retrieved by role `"raster"`
- **THEN** the same adapter instance SHALL be returned

#### Scenario: Duplicate registration

- **GIVEN** an adapter is already registered for role `"raster"`
- **WHEN** another adapter is registered for the same role
- **THEN** the new adapter SHALL replace the previous one

#### Scenario: Retrieval for unknown role

- **GIVEN** no adapter is registered for role `"custom"`
- **WHEN** the factory is queried for role `"custom"`
- **THEN** the operation SHALL fail with a diagnostic message
