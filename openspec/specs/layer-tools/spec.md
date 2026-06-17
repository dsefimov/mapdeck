### Requirement: Context Menu Extensibility

Every layer node in the tree SHALL be queryable for available tools. The set of tools returned SHALL be determined by the node's display role. A tool declares its role binding during registration; the system matches tools to nodes based on that binding.

#### Scenario: Tools filtered by layer role

- **GIVEN** a developer has registered tools bound to `"raster"`, `"vector"`, and `"point-cloud"` respectively
- **WHEN** the system queries tools for a node with display role `"raster"`
- **THEN** the query SHALL return only the tool bound to `"raster"`
- **THEN** tools bound to `"vector"` or `"point-cloud"` SHALL NOT appear in the result

#### Scenario: Tool for all layer roles

- **GIVEN** a developer has registered a tool for all roles
- **WHEN** the system queries tools for any node with any registered display role
- **THEN** the tool SHALL appear in the result set

#### Scenario: Tool for multiple specific roles

- **GIVEN** a developer has registered a tool bound to roles `"vector"` and `"geojson"`
- **WHEN** the system queries tools for a node with role `"vector"`
- **THEN** the tool SHALL appear in the result
- **WHEN** the system queries tools for a node with role `"geojson"`
- **THEN** the tool SHALL appear in the result
- **WHEN** the system queries tools for a node with role `"raster"`
- **THEN** the tool SHALL NOT appear in the result

#### Scenario: Node without display role

- **GIVEN** a tree node has no display capability
- **WHEN** the system queries tools for that node
- **THEN** the result SHALL be an empty set

### Requirement: Runtime Role Extensibility

The system SHALL allow new display roles to be registered at runtime. Roles known to the system determine which tools are returned for which nodes. Tools registered for all roles are resolved to known roles at registration time.

#### Scenario: New role extends all-type tools

- **GIVEN** a developer registers a new role `"custom"`, then registers a tool for all roles
- **WHEN** the system queries tools for a node with role `"custom"`
- **THEN** the tool SHALL appear in the result set

#### Scenario: All-type tool registered before role registration

- **GIVEN** a tool for all roles was registered before role `"custom"` was added
- **WHEN** the system queries tools for a node with role `"custom"`
- **THEN** the tool SHALL NOT appear in the result (resolution happens at registration time)

#### Scenario: Duplicate role registration

- **GIVEN** a role `"raster"` is already known to the system
- **WHEN** a module attempts to register role `"raster"` again
- **THEN** the registration SHALL be rejected
- **THEN** the existing configuration for `"raster"` SHALL remain unchanged
- **THEN** the system SHALL NOT surface an error to the end user

### Requirement: Duplicate Action Prevention

The system SHALL prevent registering two tools with the same identifier for the same layer role.

#### Scenario: Duplicate tool registration

- **GIVEN** a tool with id `"opacity-slider"` and role `"raster"` is already registered
- **WHEN** a developer attempts to register another tool with id `"opacity-slider"` and role `"raster"`
- **THEN** the duplicate SHALL be silently ignored
- **THEN** the first-registered tool SHALL remain active

#### Scenario: Same id different role

- **GIVEN** a tool with id `"opacity-slider"` and role `"raster"` is registered
- **WHEN** a developer registers a tool with id `"opacity-slider"` and role `"vector"`
- **THEN** both registrations SHALL succeed (role scoping prevents collision)

### Requirement: Action Localization

Every tool SHALL support localization. The system SHALL display tool names and labels in the configured language when translations are provided.

#### Scenario: Action displayed with translation

- **GIVEN** a tool provides translations for English, and the portal locale is set to English
- **WHEN** the system renders the tool label
- **THEN** the displayed text SHALL match the English translation entry

#### Scenario: Missing translation fallback

- **GIVEN** a tool provides translations for English only, and the portal requests Russian
- **WHEN** the system resolves the tool label
- **THEN** the fallback SHALL be English

#### Scenario: No translations provided

- **GIVEN** a tool provides no translations
- **WHEN** the system renders the tool
- **THEN** the tool SHALL render without translated labels (raw keys or empty display)

### Requirement: Action Execution Context

When the system invokes a tool, it SHALL pass the identity of the specific tree node the tool was triggered for. The tool SHALL validate that the node exists and has the expected configuration before producing output.

#### Scenario: Action receives correct node context

- **GIVEN** two tree nodes `"node-A"` and `"node-B"` both have role `"raster"` with different opacity values
- **WHEN** the system invokes the raster opacity tool with node `"node-A"`
- **THEN** the tool SHALL read configuration from `"node-A"` only
- **THEN** `"node-B"`'s configuration SHALL remain unchanged by any action on `"node-A"`

#### Scenario: Action handles invalid node state

- **GIVEN** a tool is invoked for a node whose configuration lacks the fields expected by the tool
- **WHEN** the tool validates the node's configuration
- **THEN** the tool SHALL produce no output
- **THEN** no error SHALL be surfaced to the end user

#### Scenario: Rapid sequential updates

- **GIVEN** a tool's control fires multiple configuration updates within a single frame
- **WHEN** the final call arrives
- **THEN** only the final value SHALL be reflected in the layer's rendering
- **THEN** the layer SHALL render at most once per animation frame
