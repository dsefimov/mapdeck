import type { TranslationDict } from "@core/contracts";

const en = {
    "widget.name": "Widgets",
    "aria.selectWidget": "Select {name} widget",
};

/** Locale keys of the sidebar namespace — derived from the en dictionary. */
export type SidebarLocaleKey = keyof typeof en;

export const sidebarTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
