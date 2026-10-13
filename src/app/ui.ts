/**
 * The `mapdeck/ui` subpath: the design-system surface for extension
 * panels — primitives, shared composites, hooks, and the theme helpers.
 *
 * The composition is a stability contract: everything a tool panel
 * needs, nothing that is application chrome. Grid shells
 * (`WidgetGrid`, `WidgetShell`) and boot screens (`ErrorScreen`,
 * `LoadingScreen`, `ErrorBoundary`) stay internal — they render inside
 * the library's own root component, and the grid is store-driven.
 */

export {
    Icon,
    type IconProps,
    type IconName,
    isIconName,
    Spinner,
    type SpinnerProps,
    Button,
    type ButtonProps,
    IconButton,
    type IconButtonProps,
    SearchInput,
    type SearchInputProps,
    Text,
    type TextProps,
    Field,
    type FieldProps,
    ColorSlider,
    type ColorSliderProps,
} from "@core/ui";
export {
    TextInput,
    type TextInputProps,
    SelectInput,
    type SelectInputProps,
    type SelectOption,
    type SelectGroup,
    CheckboxInput,
    type CheckboxInputProps,
    NumberInput,
    type NumberInputProps,
    SliderInput,
    type SliderInputProps,
    SwitchInput,
    type SwitchInputProps,
    InputLabel,
    type InputLabelProps,
} from "@core/ui";
export {
    EmptyState,
    type EmptyStateProps,
    InlineError,
    type InlineErrorProps,
} from "@core/ui";
export {
    CollapsibleMenu,
    type CollapsibleMenuItem,
    type CollapsibleMenuProps,
    ContextMenu,
    useMapContextMenu,
    type MapContextMenuAPI,
    type ContextMenuPosition,
    type MenuSize,
} from "@core/ui";
export {
    useClickOutside,
    useDebounce,
    type UseDebounceResult,
    useEscapeKey,
    useMapCursor,
    useMenuKeyboard,
    type MenuKeyboardEvent,
} from "@core/ui";
export { ToolPanel, type ToolPanelProps } from "@core/ui";
export {
    SummarySection,
    type SummarySectionProps,
    type SummaryItem,
} from "@core/ui";
export {
    SegmentsList,
    type SegmentsListProps,
    type Segment,
    type SegmentDetail,
} from "@core/ui";
export {
    DataTable,
    type DataTableProps,
    type GeometryColumnConfig,
} from "@core/ui";
export { ColorPicker, type ColorPickerProps } from "@core/ui";
export {
    THEME_TEXT,
    THEME_TEXT_SECONDARY,
    THEME_BG,
    THEME_BORDER,
    THEME_TRACK,
    THEME_ACCENT,
    THEME_ACCENT_800,
    THEME_ON_ACCENT,
    THEME_ERROR,
    THEME_SUCCESS,
    THEME_MEASURE_STROKE,
    THEME_MEASURE_FILL,
    THEME_MEASURE_PREVIEW,
    DEFAULT_COLOR_TEXT,
    DEFAULT_COLOR_ACCENT,
    DEFAULT_ACCENT_CSS,
    DEFAULT_TEXT_CSS,
    COLOR_ALPHA_FILL,
    COLOR_ALPHA_STROKE,
    COLOR_ALPHA_PREVIEW,
    getMeasureColors,
    getThemeValue,
    getThemeColor,
    subscribeTheme,
    type MeasureColors,
    useMeasureColors,
} from "@core/ui";
