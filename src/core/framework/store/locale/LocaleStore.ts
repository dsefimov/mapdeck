import { makeAutoObservable, observable } from "mobx";
import type { SupportedLanguage, TranslationDict } from "@core/framework/types";
import { DEFAULT_LANGUAGE } from "@core/framework/types";

/**
 * Namespace-based locale store.
 *
 * Stores translations as a flat string map per namespace.
 * Extensions register their own translations via `registerTranslations()`.
 * Components retrieve strings via `t(namespace)`.
 */
export class LocaleStore {
    /** Current active language */
    currentLang: SupportedLanguage = DEFAULT_LANGUAGE;

    /**
     * Internal storage: namespace → { language → TranslationDict }
     * @internal
     */
    private readonly _translations = observable.map<
        string,
        Partial<Record<SupportedLanguage, TranslationDict>>
    >();

    /** Cached map of namespace → dict for current language. Rebuilt on mutation. */
    _currentDictMap = new Map<string, TranslationDict>();

    constructor() {
        makeAutoObservable(this);
        this._rebuildCurrentDict();
    }

    /**
     * Register translations for a namespace.
     * Idempotent — safe to call multiple times (merges new keys).
     */
    registerTranslations(
        namespace: string,
        dict: Partial<Record<SupportedLanguage, TranslationDict>>,
    ): void {
        const existing = this._translations.get(namespace) ?? {};
        for (const [lang, entries] of Object.entries(dict)) {
            const langKey = lang as SupportedLanguage;
            existing[langKey] = {
                ...(existing[langKey] as TranslationDict | undefined),
                ...(entries as TranslationDict),
            };
        }
        this._translations.set(namespace, existing);
        this._rebuildCurrentDict();
    }

    /**
     * Get the translation dictionary for a namespace.
     * Returns the current language's strings, falling back to English.
     * Returns an empty object if the namespace is not registered.
     */
    t(namespace: string): TranslationDict {
        return this._currentDictMap.get(namespace) ?? {};
    }

    /**
     * Set the current language.
     * MobX reactivity ensures observer() components re-render.
     */
    setLanguage(lang: SupportedLanguage): void {
        this.currentLang = lang;
        this._rebuildCurrentDict();
    }

    private _rebuildCurrentDict(): void {
        const result = new Map<string, TranslationDict>();
        for (const [ns, langs] of this._translations) {
            const dict = (langs[this.currentLang] ??
                langs[DEFAULT_LANGUAGE]) as TranslationDict | undefined;
            if (dict) result.set(ns, dict);
        }
        this._currentDictMap = result;
    }
}
