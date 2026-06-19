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

### Requirement: All color schemes precomputed at load time

The point cloud streaming loader SHALL compute all four color schemes (RGB, elevation, intensity, classification) during initial node processing and retain them for the lifetime of the layer.

#### Scenario: All schemes computed in a single worker pass

- **GIVEN** a COPC node with `hasColor: true` is being processed
- **WHEN** the worker computes colors for the node
- **THEN** the worker SHALL return all four color arrays (RGB, elevation, intensity, classification) in a single result

#### Scenario: Switching between any two schemes is instantaneous

- **GIVEN** a point cloud layer with precomputed color buffers
- **WHEN** the user switches from any scheme to any other scheme
- **THEN** the switch SHALL complete synchronously (no worker call, no async delay)
- **THEN** the rendering adapter SHALL immediately display the selected scheme

#### Scenario: New nodes extend all four buffers

- **GIVEN** a point cloud layer with precomputed color buffers
- **AND** new nodes stream in during progressive loading
- **WHEN** the new points finish processing
- **THEN** all four color buffers SHALL include the new points at their respective offsets

#### Scenario: All buffers released on destroy

- **GIVEN** a point cloud layer with precomputed color buffers
- **WHEN** the loader is destroyed
- **THEN** all four color buffers SHALL be released

### Requirement: RGB colors always available

The loader SHALL always retain the points' original RGB colors when the source file contains color data, regardless of which scheme is active for display. Switching back to RGB SHALL restore the exact original colors.

#### Scenario: RGB preserved across multiple scheme switches

- **GIVEN** a point cloud with `hasColor: true`
- **AND** the user switches through all four schemes in any order
- **WHEN** the user selects the RGB scheme
- **THEN** the displayed colors SHALL exactly match the original point colors from the source file

#### Scenario: RGB remains intact during progressive loading

- **GIVEN** a point cloud with `hasColor: true` is loading progressively
- **AND** the user switches to elevation, then to classification during loading
- **WHEN** loading completes and the user switches back to RGB
- **THEN** all loaded points SHALL display their original RGB colors
