### Requirement: Widget Interface Definition

A widget SHALL implement the `Widget<TProps>` interface. The interface SHALL require `id` (unique string), `name` (human-readable), `icon` (SVG import), and `component` (React component receiving `TProps`). A widget MAY provide `defaultWidth`, `defaultHeight`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight` for grid sizing. A widget MAY provide `initialize(context)` and `destroy()` lifecycle hooks. A widget MAY provide `localeTranslations` and `settings`. A widget MAY provide `showInSidebar` (defaults to `true`).

#### Scenario: Minimal widget definition

- **GIVEN** a widget with `id: "my-widget"`, `name: "My Widget"`, `icon`, and `component`
- **WHEN** the widget is registered
- **THEN** registration SHALL succeed
- **THEN** the widget SHALL appear in the sidebar

#### Scenario: Widget with size constraints

- **GIVEN** a widget with `defaultWidth: 20`, `defaultHeight: 15`, `minWidth: 10`, `minHeight: 8`, `maxWidth: 40`, `maxHeight: 30`
- **WHEN** the widget is opened
- **THEN** the panel SHALL open with width 20 and height 15 grid units
- **THEN** the user SHALL NOT be able to resize below 10×8 or above 40×30

#### Scenario: Widget hidden from sidebar

- **GIVEN** a widget with `showInSidebar: false`
- **WHEN** the widget is registered
- **THEN** the widget SHALL NOT appear as a sidebar button
- **THEN** the widget MAY still be openable programmatically via `overlayStore.openWidget(id)`

### Requirement: Widget Registration

Widget registration SHALL be explicit via `catalogStore.registerWidget(widgetDef)`. During registration, the catalog store SHALL auto-register the widget's translations via `localeStore` and settings via `settingsStore`. The widget SHALL be added to the `registerWidgets.ts` explicit array.

#### Scenario: Widget registration with translations and settings

- **GIVEN** a widget definition with `localeTranslations` and a `settings` array
- **WHEN** `catalogStore.registerWidget(widgetDef)` is called
- **THEN** `localeStore.registerTranslations(widgetDef.id, widgetDef.localeTranslations)` SHALL be called
- **THEN** `settingsStore.registerSetting()` SHALL be called for each setting entry
- **THEN** the widget SHALL be stored in the catalog

#### Scenario: Widget registration without optional fields

- **GIVEN** a widget definition with no `localeTranslations`, no `settings`, and no lifecycle hooks
- **WHEN** `catalogStore.registerWidget(widgetDef)` is called
- **THEN** registration SHALL succeed
- **THEN** no translations or settings SHALL be registered

#### Scenario: Widget lifecycle hooks called

- **GIVEN** a widget definition with `initialize(context)` and `destroy()` hooks
- **WHEN** `catalogStore.registerWidget(widgetDef)` is called
- **THEN** `initialize(context)` SHALL be called asynchronously, receiving `WidgetContext` (providing `rootStore` and `catalogStore`)
- **WHEN** `catalogStore.unregisterWidget(widgetDef.id)` is called
- **THEN** `destroy()` SHALL be called asynchronously

#### Scenario: Duplicate widget id

- **GIVEN** a widget with id `"my-widget"` is already registered
- **WHEN** another widget with the same id is registered
- **THEN** the duplicate SHALL be silently ignored
- **THEN** the first-registered widget SHALL remain active

### Requirement: Widget Open and Close

The system SHALL open widgets via `overlayStore.openWidget(id)` and close them via `overlayStore.closeWidget(id)`. Opening a widget SHALL create a floating panel in the grid at the widget's default or last-known position. Closing a widget SHALL remove the panel but preserve widget-local state.

#### Scenario: Widget opens at default position

- **GIVEN** a registered widget with `defaultWidth: 20`, `defaultHeight: 15`
- **WHEN** `overlayStore.openWidget("my-widget")` is called
- **THEN** a floating panel SHALL appear in the grid at 20×15 units

#### Scenario: Widget reopens at last position

- **GIVEN** a widget was opened, moved by the user, then closed
- **WHEN** the widget is opened again
- **THEN** the panel SHALL appear at the last user-set position and size, stored in `overlayStore`'s layout state
- **THEN** the position SHALL NOT survive a page refresh (layout is in-memory only)

#### Scenario: Widget close preserves state

- **GIVEN** a widget has local state stored via `overlayStore.getWidgetStore(id, factory)`
- **WHEN** `overlayStore.closeWidget("my-widget")` is called
- **THEN** the panel SHALL be removed from the grid
- **THEN** the widget-local store SHALL remain cached
- **WHEN** the widget is reopened
- **THEN** the previously cached local store SHALL be returned

#### Scenario: Opening an already-open widget

- **GIVEN** a widget is already open as a panel
- **WHEN** `overlayStore.openWidget("my-widget")` is called again
- **THEN** the existing panel SHALL be brought to front via `bringToFront(id)`

### Requirement: Grid Layout System

Widget panels SHALL render in an 80×45 grid using `react-grid-layout`. Panels SHALL be draggable and resizable. Dragging a panel to any edge SHALL expand it to full width or height (edge snapping). The z-order SHALL be managed by `bringToFront(widgetId)`.

#### Scenario: Grid coordinates

- **GIVEN** a widget panel at position `{ x: 10, y: 5 }` with size `{ w: 20, h: 15 }`
- **WHEN** the grid renders
- **THEN** the panel SHALL occupy grid columns 10–30 and rows 5–20

#### Scenario: Edge snapping to full width

- **GIVEN** a widget panel is being dragged
- **WHEN** the panel's edge reaches the grid boundary
- **THEN** the panel SHALL snap to full width (80 units)

#### Scenario: Z-order on bring-to-front

- **GIVEN** three open widget panels with widget A behind widget B behind widget C
- **WHEN** `overlayStore.bringToFront("widget-A")` is called
- **THEN** widget A SHALL appear on top of B and C

### Requirement: Directory Convention

A widget SHALL be placed in `src/widgets/<widget-name>/`. The directory SHALL contain at minimum an `index.ts` barrel export. If the widget has ≤3 source files, everything SHALL remain in the root directory. If >3 source files, subdirectories `components/`, `store/`, `utils/` SHALL be used. File names within the widget SHALL omit the widget name prefix.

#### Scenario: Small widget with flat structure

- **GIVEN** a widget with 3 source files (Widget.tsx, types.ts, locale.ts)
- **WHEN** the widget directory is created
- **THEN** all files SHALL be in `src/widgets/<name>/` with no subdirectories

#### Scenario: Large widget with subdirectories

- **GIVEN** a widget with 6 source files
- **WHEN** the widget directory is created
- **THEN** React components SHALL go in `components/`
- **THEN** MobX stores SHALL go in `store/`
- **THEN** pure functions SHALL go in `utils/`

### Requirement: CSS Theming

Widget styles SHALL use CSS Modules (`.module.css`) co-located with their component. Styles SHALL use CSS custom properties from the theme — no hardcoded colors, spacing, or typography values. The theme token list is at `src/core/ui/styles/theme.css`.

#### Scenario: CSS Module co-located with component

- **GIVEN** a widget component at `src/widgets/my-widget/components/Widget.tsx`
- **WHEN** the widget is styled
- **THEN** the stylesheet SHALL be at `src/widgets/my-widget/components/Widget.module.css`

#### Scenario: Theme variable for color

- **GIVEN** a widget needs a primary color background
- **WHEN** the CSS is written
- **THEN** the value SHALL use `var(--color-primary)`, not a hardcoded hex value
