### Requirement: Setting Metadata Types

The system SHALL support four setting types, each with a specific metadata structure discriminated by a `type` field: `"string"`, `"number"`, `"select"`, and `"boolean"`. The `type` field SHALL determine which additional fields are valid and the type of `defaultValue`.

#### Scenario: String setting metadata

- **GIVEN** a developer defines a string setting with `type: "string"`, `id: "my-widget.title"`, `label: "Title"`, `defaultValue: ""`
- **WHEN** the setting is registered
- **THEN** the `defaultValue` SHALL be a string

#### Scenario: Number setting metadata

- **GIVEN** a developer defines a number setting with `type: "number"`, `id: "my-widget.size"`, `label: "Size"`, `defaultValue: 10`, `min: 1`, `max: 100`, `step: 1`
- **WHEN** the setting is registered
- **THEN** the `defaultValue` SHALL be a number
- **THEN** the optional `min`, `max`, and `step` fields SHALL be available

#### Scenario: Select setting metadata

- **GIVEN** a developer defines a select setting with `type: "select"`, `id: "basemap-tool.style"`, `label: "Style"`, `defaultValue: "osm"`, `options: [{ label: "OpenStreetMap", value: "osm" }, { label: "Satellite", value: "satellite" }]`
- **WHEN** the setting is registered
- **THEN** the `defaultValue` SHALL be a string matching one of the option values
- **THEN** the `options` field SHALL contain at least one entry with `label` and `value`

#### Scenario: Boolean setting metadata

- **GIVEN** a developer defines a boolean setting with `type: "boolean"`, `id: "my-widget.enabled"`, `label: "Enabled"`, `defaultValue: true`
- **WHEN** the setting is registered
- **THEN** the `defaultValue` SHALL be a boolean

#### Scenario: Setting with missing required fields

- **GIVEN** a developer attempts to create a setting without the `type` field
- **WHEN** the setting is type-checked during compilation
- **THEN** the compiler SHALL reject the incomplete setting

### Requirement: Setting Auto-Registration

The system SHALL automatically register settings declared on a widget or map tool during the extension's registration. A widget or map tool SHALL NOT need to call a separate settings registration method.

#### Scenario: Widget settings auto-registered

- **GIVEN** a widget definition includes a `settings` array with two entries
- **WHEN** `catalogStore.registerWidget(widget)` is called
- **THEN** both settings SHALL be registered in `SettingsStore` under the widget's id as owner

#### Scenario: Map tool settings auto-registered

- **GIVEN** a map tool class has a `settings` array with one entry
- **WHEN** `mapToolStore.registerTool(tool)` is called
- **THEN** the setting SHALL be registered in `SettingsStore` under the tool's id as owner

#### Scenario: Extension without settings

- **GIVEN** a widget definition has no `settings` field
- **WHEN** the widget is registered
- **THEN** no settings SHALL be registered
- **THEN** no error or warning SHALL be produced

#### Scenario: Duplicate setting id across extensions

- **GIVEN** widget `"widget-A"` and widget `"widget-B"` both declare a setting with `id: "shared-key"`
- **WHEN** both widgets are registered
- **THEN** both settings SHALL be registered — setting ids are globally unique by convention, not enforced
- **THEN** the last-registered setting with that id SHALL overwrite the previous one

### Requirement: Typed Setting Value Access

The system SHALL provide type-safe accessors for retrieving setting values. `getStringSetting(id)` SHALL return a string. `getNumberSetting(id)` SHALL return a number. `getBooleanSetting(id)` SHALL return a boolean. Using a mismatched accessor on a setting SHALL produce the type-corrected value or fail.

#### Scenario: String setting accessed by correct getter

- **GIVEN** a setting with id `"widget.title"` and type `"string"` has value `"Hello"`
- **WHEN** `settingsStore.getStringSetting("widget.title")` is called
- **THEN** the return value SHALL be `"Hello"`

#### Scenario: Number setting accessed by correct getter

- **GIVEN** a setting with id `"widget.size"` and type `"number"` has value `42`
- **WHEN** `settingsStore.getNumberSetting("widget.size")` is called
- **THEN** the return value SHALL be `42`

#### Scenario: Boolean setting accessed by correct getter

- **GIVEN** a setting with id `"widget.enabled"` and type `"boolean"` has value `true`
- **WHEN** `settingsStore.getBooleanSetting("widget.enabled")` is called
- **THEN** the return value SHALL be `true`

#### Scenario: Select setting accessed via string getter

- **GIVEN** a select setting with id `"widget.style"` has value `"dark"`
- **WHEN** `settingsStore.getStringSetting("widget.style")` is called
- **THEN** the return value SHALL be `"dark"` — select values are strings, accessed via `getStringSetting`

#### Scenario: Accessing unregistered setting

- **GIVEN** no setting with id `"nonexistent"` has been registered
- **WHEN** any getter is called with `"nonexistent"`
- **THEN** the call SHALL return `undefined`
- **THEN** no error SHALL be thrown

### Requirement: Setting Value Mutation with Validation

The system SHALL allow setting values to be updated via `setSetting(id, value)`. The update SHALL validate that the new value matches the setting's declared type. Invalid values SHALL be rejected.

#### Scenario: Valid value update

- **GIVEN** a registered number setting with id `"widget.size"` and current value `10`
- **WHEN** `settingsStore.setSetting("widget.size", 20)` is called
- **THEN** the setting value SHALL become `20`

#### Scenario: Invalid type rejection

- **GIVEN** a registered number setting with id `"widget.size"`
- **WHEN** `settingsStore.setSetting("widget.size", "twenty")` is called with a string value
- **THEN** the call SHALL be rejected
- **THEN** the setting value SHALL remain unchanged

#### Scenario: Select value not in options

- **GIVEN** a registered select setting with `options: [{ value: "a" }, { value: "b" }]`
- **WHEN** `settingsStore.setSetting(id, "c")` is called with a value not in the options list
- **THEN** the call SHALL be rejected
- **THEN** the setting value SHALL remain unchanged

#### Scenario: Number out of range

- **GIVEN** a registered number setting with `min: 0` and `max: 100`
- **WHEN** `settingsStore.setSetting(id, 150)` is called with a value exceeding max
- **THEN** the value SHALL be clamped to `100`

### Requirement: Setting Reset

The system SHALL allow resetting a setting to its declared default value. The system SHALL also allow resetting all settings belonging to a specific owner.

#### Scenario: Reset single setting

- **GIVEN** a string setting with id `"widget.title"` has default `""` and current value `"Custom Title"`
- **WHEN** `settingsStore.resetSetting("widget.title")` is called
- **THEN** the setting value SHALL become `""`

#### Scenario: Reset all settings for owner

- **GIVEN** widget `"my-widget"` owns three settings, each with a non-default value
- **WHEN** `settingsStore.resetOwnerSettings("my-widget")` is called
- **THEN** all three settings SHALL revert to their declared default values

#### Scenario: Reset unregistered setting

- **GIVEN** no setting with id `"nonexistent"` is registered
- **WHEN** `settingsStore.resetSetting("nonexistent")` is called
- **THEN** no error SHALL be thrown
- **THEN** no state SHALL change

### Requirement: Settings Grouped by Owner

The system SHALL group settings by their owner for UI rendering. The `allSettingsGrouped` computed property SHALL return an array of `SettingsGroup` objects, each containing the owner id, owner name, and an array of registered settings.

#### Scenario: Settings grouped for two owners

- **GIVEN** widget `"widget-A"` has two settings and widget `"widget-B"` has one setting
- **WHEN** `settingsStore.allSettingsGrouped` is accessed
- **THEN** the result SHALL contain two groups
- **THEN** the `"widget-A"` group SHALL contain two settings
- **THEN** the `"widget-B"` group SHALL contain one setting

#### Scenario: Owner with no settings excluded

- **GIVEN** a widget was registered with no settings
- **WHEN** `settingsStore.allSettingsGrouped` is accessed
- **THEN** that widget SHALL NOT appear in the grouped result

### Requirement: Settings UI Rendering Contract

The system SHALL render settings as form controls determined by their type. String settings SHALL render as text inputs. Number settings SHALL render as number inputs respecting `min`, `max`, and `step`. Select settings SHALL render as dropdowns. Boolean settings SHALL render as checkboxes or toggle switches.

#### Scenario: String setting renders as text input

- **GIVEN** a registered string setting
- **WHEN** the settings UI renders it
- **THEN** the rendered control SHALL be a text input

#### Scenario: Number setting renders as number input

- **GIVEN** a registered number setting with `min: 0`, `max: 100`, `step: 5`
- **WHEN** the settings UI renders it
- **THEN** the rendered control SHALL be a number input with `min="0"`, `max="100"`, `step="5"`

#### Scenario: Select setting renders as dropdown

- **GIVEN** a registered select setting with three options
- **WHEN** the settings UI renders it
- **THEN** the rendered control SHALL be a dropdown with three options

#### Scenario: Boolean setting renders as checkbox

- **GIVEN** a registered boolean setting
- **WHEN** the settings UI renders it
- **THEN** the rendered control SHALL be a checkbox or toggle switch

### Requirement: No Persistence

Settings SHALL be stored in memory only. Setting values SHALL NOT survive a page refresh. This is a known limitation, not a contract guarantee.

#### Scenario: Settings lost on page refresh

- **GIVEN** a user changes settings from their defaults
- **WHEN** the page is refreshed
- **THEN** all settings SHALL revert to their declared default values
