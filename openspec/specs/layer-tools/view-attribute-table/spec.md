### Requirement: Attribute Table Navigation

The system SHALL provide a layer tool available for all layer types that opens the attribute table widget scoped to the triggering node. The tool SHALL be visible for every layer type. The tool SHALL check the node's roles for attribute data availability and produce no output when absent.

#### Scenario: Node with attribute data

- **GIVEN** a tree node has an attribute capability with a configured endpoint URL
- **WHEN** the tool is invoked with the node's identity
- **THEN** the tool SHALL render a clickable action
- **WHEN** the action is triggered
- **THEN** the system SHALL open the attribute table widget and display data fetched from the endpoint

#### Scenario: Node without attribute capability

- **GIVEN** a tree node has no attribute capability
- **WHEN** the tool is invoked with the node's identity
- **THEN** the tool SHALL return null from its render and no data request SHALL be issued
- **THEN** the tool entry SHALL remain visible in the menu (the menu does not filter by attribute capability presence)

#### Scenario: Switching between different nodes

- **GIVEN** the attribute table widget is currently displaying data for node `"A"`
- **WHEN** the tool is triggered for node `"B"` and the widget receives the new scope
- **THEN** the widget SHALL fetch and display data for node `"B"`
- **THEN** node `"A"`'s data SHALL no longer be displayed

#### Scenario: Reopening for same node

- **GIVEN** the attribute table widget was opened for a node, then closed
- **WHEN** the tool is triggered again for the same node
- **THEN** the widget SHALL reopen and fetch data from the same endpoint
- **THEN** the fetched data SHALL match the data from the previous session (assuming no source changes)

#### Scenario: Node idempotency

- **GIVEN** a tool instance is created with a node identity
- **WHEN** the same identity is used to create a second instance
- **THEN** both instances SHALL read from the same tree node
