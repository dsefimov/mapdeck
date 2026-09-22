import { describe, expect, it, vi } from "vitest";
import type { SettingMetadata } from "@core/contracts";
import type { CommonRegistry } from "@core/common/common-registry";
import type { Widget } from "@core/contracts";
import { LocaleStore } from "@core/common/locale/LocaleStore";
import { SettingsStore } from "@core/common/settings/SettingsStore";
import { WidgetStore } from "./WidgetStore";

const WIDGET_ID = "test-widget";

function widget(
    overrides: Partial<Widget<{ widgetId: string; className?: string }>> = {},
): Widget<{ widgetId: string; className?: string }> {
    return {
        id: WIDGET_ID,
        icon: "",
        component: () => null,
        ...overrides,
    };
}

function setting(id: string): SettingMetadata {
    return { id, label: id, type: "boolean", defaultValue: false };
}

interface Harness {
    store: WidgetStore;
    settings: SettingsStore;
}

/** Real locale + settings stores over a registry stub — the chain is the subject. */
function harness(): Harness {
    const localeStore = new LocaleStore();
    const settings = new SettingsStore();
    const store = new WidgetStore({
        localeStore,
        settingsStore: settings,
    } as unknown as CommonRegistry);
    return { store, settings };
}

describe("WidgetStore registration chain", () => {
    it("auto-registers a widget's translations and settings under its id", () => {
        const { store, settings } = harness();

        store.registerWidget(
            widget({
                localeTranslations: { en: { "widget.name": "Test Widget" } },
                settings: [setting("autoscroll"), setting("compact")],
            }),
        );

        expect(settings.getOwnerSettings(WIDGET_ID)).toHaveLength(2);
        expect(settings.getBooleanSetting("autoscroll")).toBe(false);

        const group = settings.allSettingsGrouped.find(
            (g) => g.ownerId === WIDGET_ID,
        );
        expect(group?.ownerName).toBe("Test Widget");
    });

    it("falls back to the widget id when no widget.name key is registered", () => {
        const { store, settings } = harness();

        // Translations exist but carry no widget.name — the settings
        // header must not collapse to undefined.
        store.registerWidget(
            widget({
                localeTranslations: { en: { "hint.normal": "hi" } },
                settings: [setting("autoscroll")],
            }),
        );

        const group = settings.allSettingsGrouped.find(
            (g) => g.ownerId === WIDGET_ID,
        );
        expect(group?.ownerName).toBe(WIDGET_ID);
    });

    it("registers nothing when the widget declares no settings", () => {
        const { store, settings } = harness();
        const registerSettings = vi.spyOn(settings, "registerSettings");

        store.registerWidget(widget());

        expect(registerSettings).not.toHaveBeenCalled();
    });

    it("rejects a duplicate widget id", () => {
        const { store } = harness();
        store.registerWidget(widget());

        expect(() => store.registerWidget(widget())).toThrow();
    });
});
