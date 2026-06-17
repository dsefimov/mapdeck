### Requirement: Translation Dictionary Format

The system SHALL use a flat key-value dictionary for translations. Each translation entry SHALL be identified by a string key within a named namespace. The dictionary type `TranslationDict` SHALL be a `Record<string, string>`. The system SHALL NOT support nested translation structures or pluralization rules.

#### Scenario: Translation dictionary with flat keys

- **GIVEN** a developer creates a translation dictionary under namespace `"my-widget"`
- **WHEN** the dictionary is registered with entries `{ "show": "Show", "hide": "Hide" }`
- **THEN** the keys `"my-widget.show"` and `"my-widget.hide"` SHALL be resolvable

#### Scenario: Empty dictionary

- **GIVEN** a developer registers a translation dictionary with zero entries
- **WHEN** a component requests any key from that namespace
- **THEN** the system SHALL return an empty string

### Requirement: Supported Language Set

The system SHALL define a `SupportedLanguage` type enumerating the languages available in the portal. A language SHALL be added by extending the type union and providing a corresponding dictionary file.

#### Scenario: Language not in supported set

- **GIVEN** `SupportedLanguage` is `"en"`
- **WHEN** a developer attempts to register translations for language `"ru"` without adding `"ru"` to `SupportedLanguage`
- **THEN** the TypeScript compiler SHALL reject the registration

### Requirement: Namespace-Based Registration

Translations SHALL be organized by namespace. Each namespace SHALL correspond to an extension's identifier (widget id, tool id, map tool id, or module id). A namespace SHALL be a plain string unique within the set of registered namespaces.

#### Scenario: Extension registers translations under its own id

- **GIVEN** a widget with `id: "attribute-table"`
- **WHEN** `localeStore.registerTranslations("attribute-table", translations)` is called
- **THEN** the translations SHALL be stored under namespace `"attribute-table"`

#### Scenario: Multiple extensions use different namespaces

- **GIVEN** a widget registered as `"attribute-table"` and a map tool registered as `"basemap"`
- **WHEN** both register their translations under their respective ids
- **THEN** the system SHALL keep the namespaces separate
- **THEN** a key lookup in namespace `"attribute-table"` SHALL NOT return a value from namespace `"basemap"`

#### Scenario: Duplicate namespace registration

- **GIVEN** translations are already registered under namespace `"my-widget"`
- **WHEN** another set of translations is registered under the same namespace
- **THEN** the new translations SHALL replace the previous ones

### Requirement: Translation Access

The system SHALL provide translation access through `LocaleStore`. Components SHALL access translations via the `useLocale()` hook which returns a `t(namespace)` function. The `t()` function SHALL accept a namespace string and return a `TranslationDict`.

#### Scenario: Component reads translations

- **GIVEN** translations `{ "show": "Show", "hide": "Hide" }` registered under namespace `"my-widget"`, and the portal language is `"en"`
- **WHEN** a component calls `t("my-widget")`
- **THEN** the returned object SHALL have `show: "Show"` and `hide: "Hide"`

#### Scenario: Locale change triggers reactive re-render

- **GIVEN** a component wrapped in `observer()` reads translations via `useLocale()`
- **WHEN** `localeStore.currentLang` changes from `"en"` to another supported language
- **THEN** the component SHALL re-render with translations for the new language

#### Scenario: Requesting unregistered namespace

- **GIVEN** no translations are registered under namespace `"unknown"`
- **WHEN** a component calls `t("unknown")`
- **THEN** the returned object SHALL be an empty dictionary
- **THEN** no error SHALL be thrown

### Requirement: Translation Fallback Chain

When a translation key is requested, the system SHALL resolve it by checking languages in order: the requested language first, then English, then return an empty string if neither has the key.

#### Scenario: Key exists in requested language

- **GIVEN** translations are provided for `"en"` with key `"save": "Save"` and for `"ru"` with key `"save": "Сохранить"`
- **WHEN** the portal language is `"ru"`
- **THEN** requesting key `"save"` SHALL return `"Сохранить"`

#### Scenario: Key missing in requested language, present in English

- **GIVEN** translations are provided for `"en"` with key `"save": "Save"` and for `"ru"` with no key `"save"`
- **WHEN** the portal language is `"ru"`
- **THEN** requesting key `"save"` SHALL fall back to English and return `"Save"`

#### Scenario: Key missing in all languages

- **GIVEN** no translations contain key `"nonexistent"`
- **WHEN** any component requests that key
- **THEN** the system SHALL return an empty string

#### Scenario: English is the base language

- **GIVEN** the portal supports `"en"` and `"fr"`, and `"fr"` has no translations for key `"title"`
- **WHEN** `"en"` has `"title": "Hello"` and the portal language is `"fr"`
- **THEN** requesting key `"title"` SHALL return `"Hello"` (English fallback)

### Requirement: Per-Extension Locale File Convention

Each extension SHALL store its translations in a `locale.ts` file within its own directory. The file SHALL export a dictionary fragment keyed by the extension's identifier as the namespace.

#### Scenario: Extension provides locale.ts

- **GIVEN** a widget at `src/widgets/attribute-table/`
- **WHEN** the widget's `locale.ts` exports `{ "attribute-table": { en: { "show": "Show" } } }`
- **THEN** the widget object SHALL reference these translations in its `localeTranslations` field
- **THEN** the translations SHALL be registered during widget registration

#### Scenario: Extension without translations

- **GIVEN** a widget that displays only icons and has no user-facing text
- **WHEN** the widget is registered without a `locale.ts` file
- **THEN** registration SHALL succeed
- **THEN** the system SHALL NOT produce any errors or warnings

### Requirement: Dynamic String Construction Rules

The system SHALL NOT build localized sentences through string concatenation. Developers SHALL use template literals with translation keys that accept substitution parameters.

#### Scenario: Template literal for dynamic string

- **GIVEN** a translation with key `"fileCount"` and value `"{{count}} files selected"`
- **WHEN** a component needs to display "5 files selected"
- **THEN** the component SHALL use `t("my-widget").fileCount.replace("{{count}}", "5")`
- **THEN** the component SHALL NOT use `count + " files selected"` (concatenation violates the rule)

### Requirement: Number and Date Formatting

The system SHALL use the `Intl` API for formatting numbers, dates, and other locale-sensitive values. Manual formatting SHALL NOT be used.

#### Scenario: Number formatted via Intl

- **GIVEN** a component needs to display the number 1234.5
- **WHEN** the portal language is `"en"`
- **THEN** the component SHALL use `new Intl.NumberFormat("en").format(1234.5)` producing `"1,234.5"`
- **THEN** the component SHALL NOT manually insert commas or decimal separators

#### Scenario: Date formatted via Intl

- **GIVEN** a component needs to display a date
- **WHEN** the portal language is `"en"`
- **THEN** the component SHALL use `new Intl.DateTimeFormat("en", options).format(date)`
- **THEN** the component SHALL NOT manually construct date strings
