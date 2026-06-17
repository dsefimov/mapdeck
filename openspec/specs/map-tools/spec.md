### Requirement: Map Tool Type Definitions

The system SHALL support two map tool subtypes. `MapTool` SHALL be used for interactive tools with persistent state — it SHALL have an `isActive` observable, `activate(map)` and `deactivate()` methods, and a React component rendered when active. `MapActionTool` SHALL be used for one-click actions — it SHALL have an `execute(rootStore)` method and SHALL NOT have `isActive` state or a component.

#### Scenario: Interactive map tool activates and deactivates

- **GIVEN** a developer creates a MapTool with `id: "my-tool"`, `isActive: false`
- **WHEN** `tool.activate(map)` is called
- **THEN** `tool.isActive` SHALL become `true`
- **THEN** the tool's React component SHALL be rendered
- **WHEN** `tool.deactivate()` is called
- **THEN** `tool.isActive` SHALL become `false`
- **THEN** the tool's component SHALL be unmounted

#### Scenario: Action tool executes without activation

- **GIVEN** a developer creates a MapActionTool with `id: "reset-orientation"`
- **WHEN** the system calls `tool.execute(rootStore)`
- **THEN** the tool SHALL perform its action (e.g., reset map bearing and pitch)
- **THEN** no state change SHALL persist after execution
- **THEN** no `isActive` flag SHALL be toggled

#### Scenario: Only one tool active at a time

- **GIVEN** an interactive tool `"tool-A"` is currently active
- **WHEN** the system activates `"tool-B"`
- **THEN** `"tool-A"` SHALL be deactivated first
- **THEN** `"tool-B"` SHALL become active
- **THEN** at most one tool SHALL have `isActive: true` at any moment

#### Scenario: Activate failure leaves tool inactive

- **GIVEN** a MapTool whose `activate(map)` method throws an error
- **WHEN** the system calls `tool.activate(map)`
- **THEN** `tool.isActive` SHALL remain `false`
- **THEN** the previously active tool (if any) SHALL remain active

### Requirement: Map Tool as Class

A MapTool SHALL be implemented as a class, never a plain object. The class SHALL use `makeObservable(this, { isActive: observable })` to declare observables. The tool instance SHALL be created once at registration and SHALL persist for the application lifetime.

#### Scenario: Tool instance persists across activate/deactivate

- **GIVEN** a MapTool class instantiated at registration with an internal counter
- **WHEN** the tool is activated, then deactivated, then activated again
- **THEN** the same class instance SHALL be used for both activations
- **THEN** any state accumulated during the first activation SHALL be preserved

#### Scenario: Tool state uses MobX, not React useState

- **GIVEN** a MapTool with measurement data stored on its instance as an `observable` field
- **WHEN** the measurement changes
- **THEN** the component SHALL react via `observer()`, reading `tool.measurement`
- **THEN** the component SHALL NOT use `useState` for measurement data

#### Scenario: UI-only flags use component useState

- **GIVEN** a MapTool's panel has a collapsible section
- **WHEN** the section is toggled
- **THEN** the collapsed state SHALL be managed in the React component via `useState`
- **THEN** the collapsed state SHALL NOT be placed on the tool instance

### Requirement: Map Tool Registration

Map tools SHALL be registered explicitly via `MapToolStore.registerTool(tool)`. During registration, the tool's settings SHALL be auto-registered via `settingsStore`. The tool SHALL be added to the `BUILT_IN_TOOLS` array in `registerMapTools.ts`.

#### Scenario: Tool registered with settings

- **GIVEN** a MapTool class with a `settings` array containing one number setting
- **WHEN** `mapToolStore.registerTool(myTool)` is called
- **THEN** the setting SHALL be registered in `SettingsStore` under the tool's id
- **THEN** the tool SHALL appear in the tools list

#### Scenario: Duplicate tool id

- **GIVEN** a tool with id `"my-tool"` is already registered
- **WHEN** another tool with the same id is registered
- **THEN** the duplicate SHALL be silently ignored
- **THEN** the first-registered tool SHALL remain active

#### Scenario: Tool without settings

- **GIVEN** a MapTool with no `settings` field
- **WHEN** `mapToolStore.registerTool(tool)` is called
- **THEN** registration SHALL succeed
- **THEN** no settings SHALL be registered

### Requirement: Tool Placement and Ordering

A MapTool SHALL declare `placement` as one of `"top-left"`, `"top-right"`, `"bottom-left"`, or `"bottom-right"`. A MapTool SHALL declare `order` as a number for sorting within its placement group. Tools SHALL be rendered as buttons grouped by placement, sorted by order ascending.

#### Scenario: Tools grouped by placement

- **GIVEN** two tools with `placement: "top-right"` and one with `placement: "top-left"`
- **WHEN** the tools are rendered
- **THEN** the top-right tools SHALL appear in a group separate from the top-left tool

#### Scenario: Tools sorted by order

- **GIVEN** two tools with `placement: "top-right"`, one with `order: 5` and one with `order: 10`
- **WHEN** the tools are rendered
- **THEN** the tool with `order: 5` SHALL appear before the tool with `order: 10`

### Requirement: Component Contract

When a MapTool is active, the system SHALL render the tool's `component` with `MapToolComponentProps`: `rootStore`, `map` (the MapLibre instance), and `deactivate` (a callback to deactivate the tool). The component SHALL be wrapped in `observer()`.

#### Scenario: Component receives correct props

- **GIVEN** an active MapTool
- **WHEN** the component is rendered
- **THEN** the component SHALL receive `rootStore` for store access
- **THEN** the component SHALL receive `map` as the MapLibre GL instance
- **THEN** the component SHALL receive `deactivate` as a function that deactivates the tool

#### Scenario: Component calls deactivate

- **GIVEN** an active MapTool's rendered component
- **WHEN** the component calls `deactivate()`
- **THEN** the tool SHALL be deactivated
- **THEN** `tool.isActive` SHALL become `false`
- **THEN** the component SHALL be unmounted

### Requirement: Tool Localization

Each MapTool SHALL support localization via the `locale.ts` convention. Translations SHALL be registered under the tool's `id` namespace. See `openspec/specs/locale/` for the translation dictionary format and fallback chain.

#### Scenario: Tool name displayed in configured language

- **GIVEN** a tool provides translations for English under its id namespace
- **WHEN** the portal language is English
- **THEN** the tool's displayed name SHALL match the translation entry
- **THEN** missing translations SHALL fall back to English per the locale spec

#### Scenario: Tool without translations

- **GIVEN** a MapTool provides no `localeTranslations`
- **WHEN** the tool is registered
- **THEN** registration SHALL succeed
- **THEN** no translations SHALL be registered for the tool

### Requirement: Architectural Debt — State in Components

Existing tools (Ruler3D, AreaMeasure, VolumeMeasure, FeatureInfo) store business state in component `useState` rather than on the tool instance. New tools SHALL follow the pattern above (MobX on the tool instance). Migration of existing tools is tracked in PLAN.md.

#### Scenario: New tool follows the correct pattern

- **GIVEN** a developer creates a new map tool
- **WHEN** the tool needs to store measurement data
- **THEN** the data SHALL be an `observable` field on the tool class instance
- **THEN** the React component SHALL read it via `tool.measurement`, not via `useState`

