### Requirement: Point Cloud Color Scheme Control

The system SHALL provide a layer tool bound to role `"point-cloud"` that controls the color scheme. The tool SHALL support at least four schemes: RGB, classification, elevation, and intensity. The tool SHALL read and write the selected scheme via the node's configuration.

#### Scenario: Switching to elevation coloring

- **GIVEN** a point cloud layer node has color scheme set to `RGB`
- **WHEN** the tool writes `ELEVATION` to the color scheme setting
- **THEN** the color scheme value SHALL equal `ELEVATION`
- **THEN** the rendering adapter SHALL map point colors to elevation (Z) values

#### Scenario: Switching back to natural colors

- **GIVEN** a point cloud layer node has color scheme set to `ELEVATION`
- **WHEN** the tool writes `RGB` to the color scheme setting
- **THEN** the color scheme value SHALL equal `RGB`
- **THEN** the rendering adapter SHALL use the points' original RGB values

#### Scenario: Tool absent for non-point-cloud node

- **GIVEN** the system queries tools for a node with display role `"raster"`
- **WHEN** the tool list is resolved
- **THEN** the color scheme tool SHALL NOT appear in the result set

#### Scenario: All schemes available

- **GIVEN** the color scheme tool enumerates available schemes
- **WHEN** the enumeration is complete
- **THEN** the set SHALL contain exactly four entries: `RGB`, `CLASSIFICATION`, `ELEVATION`, `INTENSITY`

#### Scenario: Rapid scheme switching

- **GIVEN** a point cloud layer node receives 5 color scheme updates within 50ms with different values
- **WHEN** the final value settles
- **THEN** the color scheme value SHALL equal the final value sent
- **THEN** the point cloud SHALL display exactly one scheme — the final one

#### Scenario: Invalid scheme value

- **GIVEN** a module attempts to set the color scheme to a value not in the supported set
- **WHEN** the configuration is validated
- **THEN** the system SHALL fall back to `RGB`
