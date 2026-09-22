import { describe, expect, it } from "vitest";
import type { SupportedLanguage, TranslationDict } from "@core/contracts";
import { LocaleStore } from "./LocaleStore";

/**
 * The store is typed over SupportedLanguage ("en" today) but its runtime
 * genuinely serves any registered language; the casts below pin that
 * multi-language behavior before a second language enters the type.
 */
const DE = "de";

const deDict = (entries: Record<string, string>) =>
    ({ [DE]: entries }) as Parameters<LocaleStore["registerTranslations"]>[1];

const dict = (entries: Record<string, string>): TranslationDict => entries;

describe("LocaleStore.registerTranslations", () => {
    it("serves a registered namespace in the current language", () => {
        const store = new LocaleStore();
        store.registerTranslations("panel", {
            ["en"]: dict({ open: "Open", close: "Close" }),
        });

        expect(store.t("panel")).toEqual(dict({ open: "Open", close: "Close" }));
    });

    it("merges keys on duplicate registration instead of replacing them", () => {
        const store = new LocaleStore();
        store.registerTranslations("panel", {
            ["en"]: dict({ open: "Open", close: "Close" }),
        });
        store.registerTranslations("panel", {
            ["en"]: dict({ close: "Dismiss", zoom: "Zoom" }),
        });

        expect(store.t("panel")).toEqual(
            dict({ open: "Open", close: "Dismiss", zoom: "Zoom" }),
        );
    });

    it("keeps languages independent when a later registration adds one", () => {
        const store = new LocaleStore();
        store.registerTranslations("panel", {
            ["en"]: dict({ open: "Open" }),
        });
        store.registerTranslations("panel", deDict({ open: "Öffnen" }));

        store.setLanguage(DE as SupportedLanguage);
        expect(store.t("panel")).toEqual(dict({ open: "Öffnen" }));

        store.setLanguage("en");
        expect(store.t("panel")).toEqual(dict({ open: "Open" }));
    });
});

describe("LocaleStore fallback", () => {
    it("falls back to the whole English dictionary, not per-key", () => {
        const store = new LocaleStore();
        store.registerTranslations("panel", {
            ["en"]: dict({ open: "Open", close: "Close" }),
        });

        store.setLanguage(DE as SupportedLanguage);

        expect(store.t("panel")).toEqual(
            dict({ open: "Open", close: "Close" }),
        );
    });

    it("serves each namespace from its own language after a switch", () => {
        const store = new LocaleStore();
        store.registerTranslations("bilingual", {
            ["en"]: dict({ title: "Map" }),
        });
        store.registerTranslations("bilingual", deDict({ title: "Karte" }));
        store.registerTranslations("englishOnly", {
            ["en"]: dict({ hint: "Hint" }),
        });

        store.setLanguage(DE as SupportedLanguage);

        expect(store.t("bilingual")).toEqual(dict({ title: "Karte" }));
        expect(store.t("englishOnly")).toEqual(dict({ hint: "Hint" }));
    });

    it("returns an empty object for an unregistered namespace", () => {
        const store = new LocaleStore();

        expect(store.t("nowhere")).toEqual({});
    });
});
