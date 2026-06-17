### Requirement: Vector Layer Appearance Control

The system SHALL provide a layer tool bound to roles `"vector"` and `"geojson"` that controls fill color, border color, and opacity. The tool SHALL read and write appearance values via the node's configuration.

#### Scenario: Changing fill color

- **GIVEN** a vector layer node has fill color set to `"#005a9b"`
- **WHEN** the tool writes `"#ff0000"` to the fill color setting
- **THEN** the fill color value SHALL equal `"#ff0000"`
- **THEN** the rendering adapter SHALL produce filled areas colored `#ff0000`

#### Scenario: Changing border color

- **GIVEN** a vector layer node has border color set to `"#005a9b"`
- **WHEN** the tool writes `"#00ff00"` to the border color setting
- **THEN** the border color value SHALL equal `"#00ff00"`
- **THEN** the rendering adapter SHALL produce borders colored `#00ff00`

#### Scenario: Changing opacity

- **GIVEN** a vector layer node has opacity set to `1.0`
- **WHEN** the tool writes `0.4` to the opacity setting
- **THEN** the opacity value SHALL equal `0.4`
- **THEN** the rendering adapter SHALL apply 40% opacity to all rendered features

#### Scenario: Tool appears for both vector and geojson

- **GIVEN** the tool is registered for roles `"vector"` and `"geojson"`
- **WHEN** the system queries tools for a node with role `"vector"`
- **THEN** the tool SHALL appear in the result
- **WHEN** the system queries tools for a node with role `"geojson"`
- **THEN** the tool SHALL appear in the result

#### Scenario: Tool absent for raster node

- **GIVEN** the system queries tools for a node with role `"raster"`
- **WHEN** the tool list is resolved
- **THEN** the appearance control tool SHALL NOT appear in the result set

#### Scenario: All three properties changed simultaneously

- **GIVEN** a vector layer node has default fill color, border color, and opacity
- **WHEN** the tool writes new values for fill color, border color, and opacity in a single update
- **THEN** all three values SHALL reflect the new settings
- **THEN** the rendering adapter SHALL produce a single updated layer showing all three changes

#### Scenario: Node with wrong configuration

- **GIVEN** a tool receives a node whose role is `"geojson"` but the configuration is malformed
- **WHEN** the tool validates the configuration
- **THEN** the tool SHALL produce no output
