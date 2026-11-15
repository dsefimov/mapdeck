# ADR-0015: Locale and typed dictionaries

Status: Accepted · Date: 2026-10-13

## Context

`noUncheckedIndexedAccess` types every `Record<string, string>` lookup as
`string | undefined`, and the locale dictionaries are exactly that: `TranslationDict`
is an untyped string map, namespaces register at runtime (widgets and tools
auto-register `localeTranslations`, the core's own namespace registers in the
composition root). Without typing, every lookup needs a `dict["key"]!` assertion to
bridge the gap between "the compiler cannot know the key exists" and "the dictionary
ships with the component and always carries it".

Two facts make those assertions unnecessary in first-party code. First, the en
dictionary is registration-complete: every shipped extension's en literal is authored
next to its consumer and auto-registered with it (ADR-0005 mechanics). Second, `"en"`
is the only language the library itself ships; every other language enters as
registered data (module dictionaries), and the store resolves a namespace missing the
current language to its en dictionary whole-dict — no per-key merge — so a lookup in
shipped code still resolves. The public registration surface and the exact fallback
behavior (including namespaces without an en registration) are documented in
[docs/api/extensions.md](../api/extensions.md).

## Decision

**The en literal is the source of key truth.** Each `locale.ts` authors its dictionary
as a named `en` literal and derives the key union from it:
`export type XxxLocaleKey = keyof typeof en`. The dictionary's exported registration
shape does not change.

**One typed view per consumer.** `typedDict<Key>(dict)` in `lib/text` turns a
`TranslationDict` into a `Record<Key, string>` view. Panels call it once with their
namespace's key union; every lookup is then compile-checked — a typo or a missing key
is a build error, not a rendered `undefined`. The view rests on the en-completeness
invariant above; it is the one place that assumption is relied on, and it is
documented as such.

**No per-key runtime fallbacks** for statically known namespaces: no
`dict["key"] ?? "..."` chains. If a key can be named, the type system guarantees it.
Dynamic namespaces (`t(widget.id)` — the id is runtime data) cannot have a key union;
there the display name falls back to the id itself, the pre-existing idiom
(`getWidgetName` in `MapWorkspace`, the map toolbar).

**The generic kit types exactly what it consumes.** `ui` may not import `common/`
(layer rule), so kit components cannot name `CoreLocaleKey`; instead each declares its
consumed keys locally and builds the typed view with `typedDict` inside the component.
Shared extension components (`MeasurePanel`, `LayerSelector`) declare their consumed
keys as the prop type, which makes the compiler check that every tool namespace feeding
them carries those keys.

**Future languages lean on the store, not the types.** A module may register additional
languages for its namespaces; the store's whole-dict en fallback keeps every typed view
correct without per-key fallback code. Dynamic template-literal keys
(`validation.${reason}`) are typed through the reason unions and pinned by tests where
the key set is data (`layer-tree/locale.test.ts`).

## Consequences

- A missing or renamed dictionary key stops compiling at the lookup site; the
  non-null-assertion class disappears instead of being policed.
- The reliance on en-completeness lives in one documented function; locale typing is
  audited there instead of across scattered `!` assertions.
- Extensions that keep dictionaries untyped (module-registered, dynamic namespaces) keep
  the id-fallback idiom — this ADR does not force key unions on runtime-data namespaces.
- Adding a language is a data change (register translations); no view or fallback code
  changes.
