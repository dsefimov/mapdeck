## Context

The portal is a geospatial constructor used globally. Every user-facing string — labels, tooltips, placeholders, error messages — must be localizable. The system uses a custom lightweight i18n implementation built on MobX + TypeScript rather than a third-party library. Every extension type (widget, layer tool, map tool, module) needs to provide and consume translations.

## Goals / Non-Goals

**Goals:**
- Document the translation dictionary format and namespace convention
- Document the registration and access patterns
- Document the fallback chain and type constraints
- Provide source file references

**Non-Goals:**
- Specifying which specific strings each extension must translate (extension-specific)
- Adding new supported languages (documented in code, not this spec)
- Changing the runtime i18n implementation or fallback algorithm

## Decisions

### Custom i18n over third-party library

The portal uses a custom MobX-based localization system rather than `i18next`, `react-intl`, or similar libraries.

**Why**: Third-party i18n libraries bring runtime overhead for features the portal doesn't need (pluralization, ICU message format, context-based translation). The current system is ~150 lines of TypeScript — `TranslationDict` is a flat `Record<string, string>`, `LocaleStore` is a thin MobX observable. The system is reactive through `observer()` — when `currentLang` changes, all components re-render automatically.

**Alternatives considered**:
- `i18next` — rejected because it adds 30+ kB and the portal doesn't use its plural/interpolation/backend features
- `react-intl` — rejected because it wraps components in `<FormattedMessage>`, conflicting with the project's pure-view component conventions
- `@formatjs/cli` extraction — rejected because the portal doesn't have a message extraction pipeline

### Flat dictionary, no nesting

`TranslationDict` is `Record<string, string>` — flat key-value pairs. No nested objects, no plural forms, no context.

**Why**: Flat dictionaries are trivial to type-check. Nested structures require recursive type resolution and make partial translation dictionaries hard to validate. The portal doesn't have strings that require pluralization or gendered forms — if needed, a module can manage its own pluralization logic outside the locale system.

**Trade-off**: If a future module needs pluralization, it must implement it independently. The core system won't help.

### Namespace per extension id

Each extension uses its own `id` as the translation namespace. This prevents key collisions between extensions and makes it obvious which extension owns which translations.

**Why**: Using the extension id as namespace means:
1. No global translation namespace — keys are scoped
2. No naming convention overhead — the id already exists
3. Duplicate id detection (already enforced by idempotent registration) prevents namespace conflicts

Source: `src/core/framework/store/locale/LocaleStore.ts`

### locale.ts per extension

Each extension stores translations in `locale.ts` inside its own directory, rather than in a centralized `locales/` directory.

**Why**: Co-location keeps translations near the component that uses them. Adding a new extension doesn't require touching a central file. Removing an extension removes its translations automatically.

Source: `src/widgets/attribute-table/locale.ts` (example)

### Fallback: requested → English → empty string

The fallback chain is: requested language → English → empty string.

**Why**: English is the lingua franca of the portal — all extensions are expected to provide English translations at minimum. If a key is missing in the requested language, falling back to English is better than showing raw keys to the user.

**Why empty string, not error**: Showing an error or raw key to the user is a worse experience than showing nothing. The developer can detect missing translations by the absence of text, but the end user doesn't see broken UI.

Source: `src/core/framework/store/locale/LocaleStore.ts` — `t()` method

### TypeScript-level language constraints

`SupportedLanguage` is a TypeScript union type (currently `"en"`). Adding a language requires both extending the type union AND providing a dictionary file with all namespaces.

**Why**: The type system catches missing translations at compile time. If a developer adds `"ru"` to `SupportedLanguage` but doesn't provide a `ru.ts` dictionary file, the code won't compile.

Source: `src/core/framework/types/framework/locale.ts`

### Registration flow integration

Translations are registered during extension registration — not in a separate step. When `catalogStore.registerWidget(widget)` is called, the widget's `localeTranslations` are automatically registered via `localeStore.registerTranslations()`.

```
registerWidget(widgetDef)
  └─ localeStore.registerTranslations(widgetDef.id, widgetDef.localeTranslations)
  └─ catalogStore._widgets.set(widgetDef.id, widgetDef)
```

**Why**: Registration is a single atomic step. The developer defines translations in the extension object; the system registers them automatically. No separate "register translations" call needed.

### Reactive locale switching

`LocaleStore.currentLang` is a MobX `observable`. Components wrapped in `observer()` re-render automatically when the language changes. No React context propagation needed.

**Why**: MobX observability is already the project's reactivity model. Using it for locale switching avoids adding another React context or subscription system.

Source: `src/core/framework/store/locale/LocaleStore.ts`

## Directory Layout

```
src/core/
├── framework/
│   ├── types/framework/locale.ts     # SupportedLanguage, TranslationDict
│   ├── store/locale/LocaleStore.ts   # registerTranslations, t(), currentLang
│   └── i18n/
│       ├── dictionaries/
│       │   └── en.ts                  # English translations for all built-in namespaces
│       └── hooks/
│           └── useLocale.ts           # useLocale() hook → { t, currentLang }
```

Each extension:
```
src/widgets/<widget-name>/locale.ts    # Extension translations
src/layer-tools/<tool-name>/locale.ts
src/map-tools/<tool-name>/locale.ts
src/modules/<module-name>/locale.ts
```

## Risks / Trade-offs

- **No extraction tooling**: Translations are manually maintained in TypeScript files. No `i18next-parser` or similar extraction. Risk: stale or missing translations are caught only by manual review. Mitigation: TypeScript enforces the `SupportedLanguage` constraint; missing namespace = compile error.
- **Single language compile-time check**: Only `SupportedLanguage` is type-checked. The actual dictionary values for each language aren't structurally validated against the English base. Risk: a translation file for `"fr"` could have different keys than `"en"` without compile errors. Mitigation: `t()` returns empty string for missing keys — safe degradation.
- **No lazy loading**: All translation dictionaries are loaded at init time. No chunked or on-demand locale loading. Trade-off: acceptable because the translation payload is small (a few kB) and the current language count is 1.
