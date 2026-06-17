### Requirement: Point Size Adjustment

The system SHALL provide a layer tool bound to role `"point-cloud"` that controls point size. The tool SHALL read and write point size values via the node's configuration.

#### Scenario: Increasing point size

- **GIVEN** a point cloud layer node has point size set to `1`
- **WHEN** the tool writes `5` to the point size setting
- **THEN** the point size value SHALL equal `5`
- **THEN** the rendering adapter SHALL draw points with a diameter of 5 pixels on screen

#### Scenario: Decreasing point size

- **GIVEN** a point cloud layer node has point size set to `10`
- **WHEN** the tool writes `3` to the point size setting
- **THEN** the point size value SHALL equal `3`
- **THEN** the rendering adapter SHALL draw points with a diameter of 3 pixels on screen

#### Scenario: Minimum point size clamp

- **GIVEN** a point cloud layer node has a defined minimum point size of `1`
- **WHEN** the tool attempts to write a value below the minimum (e.g., `0`)
- **THEN** the point size value SHALL be clamped to `1`
- **THEN** points SHALL remain visible (diameter >= 1px)

#### Scenario: Tool absent for non-point-cloud node

- **GIVEN** the system queries tools for a node with display role `"raster"`
- **WHEN** the tool list is resolved
- **THEN** the point size tool SHALL NOT appear in the result set

#### Scenario: Node without point cloud configuration

- **GIVEN** a node has role `"point-cloud"` but the configuration is missing the point size field
- **WHEN** the point size tool validates the configuration
- **THEN** the tool SHALL produce no output

#### Scenario: Rapid size changes

- **GIVEN** a point cloud layer node receives 20 point size updates within 200ms with different values
- **WHEN** the final value settles
- **THEN** the point size value SHALL equal the final value sent
- **THEN** the point cloud SHALL have rendered no more than twice (initial + final) within that 200ms window
