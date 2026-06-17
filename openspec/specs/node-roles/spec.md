### Requirement: Layer Role System

Every layer in the portal SHALL have exactly one display role that determines how it renders on the map. The system SHALL support a fixed set of built-in display roles: raster, vector, point cloud, and geojson. For how roles are rendered on the map (adapters, config, render pipeline), see `openspec/specs/layer-system/`.

#### Scenario: Layer renders according to its role

- **GIVEN** a module creates a tree node with a display capability whose render descriptor has role `"raster"`
- **WHEN** the rendering pipeline receives the node and `isVisible` is `true`
- **THEN** the system SHALL create a raster tile layer on the map
- **THEN** no point cloud or vector rendering artifacts SHALL be produced for that node

#### Scenario: Unknown role type

- **GIVEN** a module creates a tree node with a display capability whose render descriptor role is not recognized by any registered adapter
- **WHEN** the rendering pipeline attempts to process the node
- **THEN** the node SHALL NOT produce a map layer
- **THEN** the system SHALL log a diagnostic entry and continue processing other nodes

#### Scenario: Node without display role

- **GIVEN** a module creates a tree node with no display capability in its roles
- **WHEN** the rendering pipeline receives the node
- **THEN** no map layer SHALL be created for that node
- **THEN** the node SHALL remain present in the layer tree

### Requirement: Role-Based Tool Availability

The actions available for a layer SHALL be determined by its display role. A role SHALL act as a filter: only tools whose role binding matches the node's display role SHALL be returned when querying tools for that node.

#### Scenario: Tools filtered by role

- **GIVEN** a developer has registered a raster-only tool and a point-cloud-only tool
- **WHEN** the system queries tools for a node with display role `"raster"`
- **THEN** the query SHALL return the raster-only tool
- **THEN** the query SHALL NOT return the point-cloud-only tool

#### Scenario: Tool for all roles

- **GIVEN** a developer has registered a tool for all roles
- **WHEN** the system queries tools for any node with any registered display role
- **THEN** the query SHALL include that tool in the result set

#### Scenario: Node without display role

- **GIVEN** a tree node has no display capability
- **WHEN** the system queries tools for that node
- **THEN** the result set SHALL be empty

#### Scenario: Tool registered for unregistered role

- **GIVEN** a developer registers a tool bound to a role that has no entries in the system's known-roles set
- **WHEN** the registration is processed
- **THEN** the tool SHALL be stored under that role and become queryable by that role

### Requirement: Display Role Constraints

A tree node SHALL have at most one display capability. A layer node MAY lack a display capability (placeholder state), in which case it SHALL appear in the tree but SHALL NOT render on the map and SHALL NOT have context menu tools.

#### Scenario: Module provides multiple display candidates

- **GIVEN** a module receives multiple display candidates from its data source (e.g., multiple STAC assets with different roles)
- **WHEN** the module constructs roles for a tree node
- **THEN** the module SHALL resolve to exactly one display capability before passing roles to the core system
- **THEN** the node's display capability field SHALL contain at most one value

#### Scenario: LayerNode without display role

- **GIVEN** a module creates a layer node with no display capability
- **WHEN** the tree widget renders the node
- **THEN** the node SHALL appear in the layer tree with its title and icon
- **WHEN** the rendering pipeline processes the node
- **THEN** no map layer SHALL be created
- **WHEN** the system queries tools for the node
- **THEN** the result SHALL be an empty set

### Requirement: Attribute Role Constraints

A tree node SHALL have at most one attribute capability. The attribute capability SHALL carry an endpoint URL from which tabular data can be fetched.

#### Scenario: Node with attribute data

- **GIVEN** a module creates a tree node with an attribute capability whose endpoint URL is set
- **WHEN** the attribute table widget requests data for that node
- **THEN** the system SHALL issue a fetch to the configured endpoint URL

#### Scenario: Node without attribute role

- **GIVEN** a module creates a tree node with no attribute capability
- **WHEN** the attribute table widget checks the node's roles
- **THEN** the widget SHALL detect the attribute capability is absent and produce no data request

#### Scenario: Attribute role with missing endpoint

- **GIVEN** a module creates a tree node with an attribute capability whose endpoint URL is an empty string
- **WHEN** the system attempts to fetch attribute data
- **THEN** the fetch SHALL fail; the widget SHALL display an empty result set without surfacing an error to the end user

### Requirement: Report Role Multiplicity

A tree node MAY have any number of report capabilities (including zero). Each report SHALL provide a downloadable asset identified by a URL and a label.

#### Scenario: Node with multiple reports

- **GIVEN** a module creates a tree node with two report entries in its reports list
- **WHEN** a UI component iterates the reports
- **THEN** the component SHALL find exactly two entries, each with a URL and label

#### Scenario: Node with no reports

- **GIVEN** a module creates a tree node with an empty reports list
- **WHEN** a UI component iterates the reports
- **THEN** the iteration SHALL produce zero items

### Requirement: Custom Role Extensibility

The system SHALL allow modules to define new display role values beyond the built-in set. Custom roles SHALL be usable wherever built-in roles are expected — tool binding, rendering, and config creation.

#### Scenario: Module defines a custom role

- **GIVEN** a developer creates a module that defines a custom role name
- **WHEN** the module creates tree nodes with that role assigned to a display capability
- **THEN** the node SHALL be accepted by the system as a valid node

#### Scenario: Custom role bound to all-type tools

- **GIVEN** a developer has defined a custom role and registered it in the tool system
- **WHEN** the system queries tools for a node with the custom role
- **THEN** all tools registered for all roles SHALL be present in the result set

#### Scenario: Unregistered custom role

- **GIVEN** a developer defines a custom role name but never registers it in the tool system
- **WHEN** a tool for all roles was registered before the node was created
- **THEN** the all-roles tool SHALL NOT automatically be returned for the node (all-roles resolution happens at registration time)

### Requirement: Built-in Role Set

The system SHALL include built-in display role values: `raster`, `vector`, `point cloud`, and `geojson`. These roles SHALL be available in every portal instance without requiring module registration. Additional built-in roles MAY be added in future releases.

#### Scenario: Built-in roles always present

- **GIVEN** a fresh portal instance with no modules loaded
- **WHEN** the system creates a tree node whose display capability carries role `"raster"`
- **THEN** the system SHALL accept the node and produce a map layer without additional registration
