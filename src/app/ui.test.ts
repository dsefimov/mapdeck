import { describe, expect, it } from "vitest";
import * as ui from "./ui";

const PANEL_SURFACE = [
    "Icon",
    "isIconName",
    "Spinner",
    "Button",
    "IconButton",
    "SearchInput",
    "Text",
    "Field",
    "ColorSlider",
    "TextInput",
    "SelectInput",
    "NumberInput",
    "SliderInput",
    "SwitchInput",
    "CheckboxInput",
    "EmptyState",
    "InlineError",
    "CollapsibleMenu",
    "ContextMenu",
    "useMapContextMenu",
    "useClickOutside",
    "useEscapeKey",
    "useDebounce",
    "useMapCursor",
    "useMenuKeyboard",
    "ToolPanel",
    "SummarySection",
    "SegmentsList",
    "DataTable",
    "ColorPicker",
    "getThemeColor",
    "getThemeValue",
    "getMeasureColors",
    "subscribeTheme",
    "useMeasureColors",
    "DEFAULT_ACCENT_CSS",
] as const;

describe("mapdeck/ui subpath", () => {
    it.each(PANEL_SURFACE)("exports %s", (name) => {
        expect(ui[name]).toBeDefined();
    });

    it.each(["WidgetGrid", "WidgetGridWrapper", "WidgetShell", "ErrorScreen", "LoadingScreen", "ErrorBoundary"])(
        "keeps application chrome internal: %s stays out",
        (name) => {
            expect(ui).not.toHaveProperty(name);
        },
    );
});
