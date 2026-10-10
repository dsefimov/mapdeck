# ADR-0015: Locale — en-complete dictionaries, typed key views

## Context

`noUncheckedIndexedAccess` types every `Record<string, string>` lookup as
`string | undefined`, and the locale dictionaries are exactly that:
`TranslationDict` is an untyped string map, namespaces register at runtime
(widgets and tools auto-register `localeTranslations`, the core namespace
registers in the composition root). The 2026-09 review sweep counted ~42
`dict["key"]!` assertions papering over the gap between "the compiler cannot
know the key exists" and "the dictionary ships with the component and always
carries it".

Two facts make those assertions unnecessary. First, the en dictionary is
registration-complete: every extension's en literal is authored next to its
consumer and auto-registered with it (ADR-0005 mechanics), and the store
falls back to the en dictionary whole-dict when a language is missing
(`LocaleStore`). Second, `"en"` is the only language the library itself
ships; every other language enters as registered data (module dictionaries),
and a namespace without a registration in the current language resolves
through that whole-dict en fallback — so every lookup still resolves.

## Decision

**The en literal is the single source of key truth.** Each `locale.ts`
authors its dictionary as a named `en` literal and derives the key union from
it: `export type XxxLocaleKey = keyof typeof en`. The dictionary's exported
registration shape does not change.

**One sanctioned cast, one place.** `typedDict<Key>(dict)` in `lib/text`
turns a `TranslationDict` into a `Record<Key, string>` view. Panels call it
once with their namespace's key union; every lookup is then compile-checked —
a typo or a missing key is a build error, not a rendered `undefined`. The
cast is safe because of the en-completeness invariant above; it is documented
as the only place that trust is spent.

**No per-key runtime fallbacks** for statically known namespaces: no
`dict["key"] ?? "..."` chains. If a key can be named, the type system
guarantees it. Dynamic namespaces (`t(widget.id)` — the id is runtime data)
cannot have a key union; there the display name falls back to the id itself,
the pre-existing idiom (`getWidgetName` in `MapWorkspace`, the map toolbar).

**The generic kit types exactly what it consumes.** `ui` may not import
`common/` (layer rule), so kit components cannot name `CoreLocaleKey`;
instead each declares its consumed keys locally and builds the typed view
with `typedDict` inside the component. Shared extension components
(`MeasurePanel`, `LayerSelector`) declare their consumed keys as the prop
type, which makes the compiler check that every tool namespace feeding them
carries those keys.

**Future languages lean on the store, not the types.** A module may register
additional languages for its namespaces; the store's whole-dict en fallback
keeps every typed view correct without per-key fallback code.

Why a new number: no existing ADR hosts locale policy — 0004/0005/0006/0007
each touch translations only as registration mechanics of their own subject,
and ADR-0007 says so explicitly: "The translation dictionary format and the
fallback chain belong to the locale area." This ADR is that home. The
en-completeness invariant itself rests on the registration mechanics of
ADR-0004/0005, and the decision applies equally to the core namespace, which
is not an extension. Dynamic template-literal keys (`validation.${reason}`)
are typed through the reason unions and pinned by tests where the key set is
data (`layer-tree/locale.test.ts`).

## Consequences

- A missing or renamed dictionary key stops compiling at the lookup site —
  the assertion class disappears instead of being policed.
- The trust boundary is one documented function; reviews grep for
  `as Record<` in locale context instead of auditing dozens of `!`.
- Extensions that keep dictionaries untyped (module-registered, dynamic
  namespaces) keep the id-fallback idiom — this ADR does not force key
  unions on runtime-data namespaces.
- Adding a language is a data change (register translations); no view or
  fallback code changes.
