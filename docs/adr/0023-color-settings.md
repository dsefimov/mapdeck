# ADR-0023: Color settings

Status: Accepted · Date: 2026-11-14

## Context

Settings carried four value types (string, number, select, boolean),
all rendered as text-ish inputs. Feature selection (ADR-0022) needs a
user-chosen color, and hex strings in a plain text field would be both
error-prone and below the design system's bar — the kit already has a
`ColorPicker` composite (swatch, hex field, hue slider) used by layer
tools.

## Decision

`SettingType` gains `"color"`: `ColorSettingMetadata` declares a
`defaultValue` hex string; `RegisteredSetting` carries the current
`#RRGGBB` value. Validation accepts only strings that
`normalizeHex` accepts, registration stores the declared default, and
the settings widget's input switch renders the kit `ColorPicker` for
the variant. `SettingsReadPort.getStringSetting` serves color values —
a color is a string at rest, so no new reader is added; its JSDoc names
color explicitly.

## Consequences

- The variant is compiler-discriminated like the others: the settings
  form's switch narrows value and input with no casts.
- `settingsOverrides` embeds color values without changes — they pass
  the same validation path.
- The value stays canonical `#RRGGBB`; three- or eight-digit hex and
  missing `#` are rejected (normalizeHex accepts only six digits after
  normalization), keeping every consumer's parser trivial.
