### Requirement: Raster Layer Opacity Control

The system SHALL provide a layer tool bound to role `"raster"` that controls raster layer opacity. The tool SHALL read and write opacity values via the node's configuration.

#### Scenario: Opacity within valid range

- **GIVEN** a raster layer node has opacity set to `1.0`
- **WHEN** the tool writes `0.3` to the opacity setting
- **THEN** the opacity value SHALL equal `0.3`
- **THEN** the rendering adapter SHALL apply opacity `0.3` to the raster tiles

#### Scenario: Opacity at minimum value (0.0)

- **GIVEN** a raster layer node has opacity at `1.0`
- **WHEN** the tool writes `0.0` to the opacity setting
- **THEN** the opacity value SHALL equal `0.0`
- **THEN** the rendering adapter SHALL produce fully transparent tiles (still present, alpha = 0)

#### Scenario: Opacity at maximum value (1.0)

- **GIVEN** a raster layer node has opacity at `0.5`
- **WHEN** the tool writes `1.0` to the opacity setting
- **THEN** the opacity value SHALL equal `1.0`
- **THEN** the rendering adapter SHALL produce fully opaque tiles

#### Scenario: Rapid opacity changes

- **GIVEN** a raster layer node receives 10 opacity updates within 100ms with different values
- **WHEN** the final value settles
- **THEN** the opacity value SHALL equal the final value sent
- **THEN** the layer SHALL have rendered no more than twice (initial + final) within that 100ms window

#### Scenario: Tool absent for non-raster node

- **GIVEN** the system queries tools for a node with display role `"point-cloud"`
- **WHEN** the tool list is resolved
- **THEN** the raster opacity tool SHALL NOT appear in the result set

#### Scenario: Opacity restored to original value

- **GIVEN** a raster layer node's opacity was changed from `1.0` to `0.3` and back to `1.0`
- **WHEN** the adapter processes the final configuration
- **THEN** the rendered opacity SHALL equal `1.0`
- **THEN** the rendered pixel alpha values SHALL match those produced when the layer was first loaded at opacity `1.0`
