# ADR-0018: Asset→protocol mapping is a core domain — the `assetMapping` port

Status: Accepted · Date: 2026-10-13

## Context

Which protocol serves a tree node is a mapping with two candidate
owners: the source module that parses the catalog, or the core. The
mapping's input — an asset: a tagged resource at a URL — is
source-neutral, and "which protocol serves which slot" is knowledge
about protocols, not about a source. A fitness table inside a source
module ties protocols to that one source: a consumer can register a
protocol (`context.protocols.register`), yet no asset routes to it —
no matching rule, no fitness entry (`unknown protocol id → report
row`); Terrain-3D and WFS-3D protocols would render nothing. A port on
a source module is rejected for the same reason: it would tie every
protocol module to that source. The seam belongs in the protocols
domain, where protocol modules already register.

## Decision

**A core mapper, one port.** `AssetProtocolMapper`
(`src/core/domain/protocols/asset-mapping/`) unifies the matching
rules, the slot fitness, and the selection logic (pure, in `logic/`).
`ModuleContext.assetMapping` (`AssetMappingPort`, contracts) exposes:

- `registerRule(rule: AssetRule)` — the matching chain, priority-ordered
  (lower first, registration order breaks ties);
- `registerSlots(protocolId, slots, opts?)` — a protocol's slot fitness,
  under the common duplicate policy (throw, `{ override: true }` + warn);
- `mapAssets(assets, options?)` — what source adapters call at fetch
  time: the first claiming rule wins each asset, the best slot fitness
  wins each slot (ties keep the earlier asset), slot-less assignments
  become report rows, `null` when nothing matched.

One port for both directions: the only `mapAssets` reader is a
module's own source adapter (STAC), so a read/write split would have a
single-consumer read side.

**Neutral contracts.** `SourceAsset` (open index signature carries
source-specific fields; the core never reads them), `AssetContext`
(the owning entity's per-asset context), `AssetRule`,
`ProtocolAssignment`, `AssetMappingResult` — all in
`contracts/domain/asset-mapping.ts`, exported through
`mapdeck/contracts`. The STAC module's resolvers are plain rules over
these types; their vocabulary (roles, MIME heuristics) stays STAC-side.

**Boot freshness instead of idempotency guards.** The mapper is created
by `RootStore`, not observable (registration finishes before any
observer renders; mapping runs in fetch flows). A restart builds a
fresh store — a fresh mapper — and bootstrap re-registers the built-in
rules.

**Default slots live with the protocols.** The built-in fitness values are
declared at each built-in protocol's registration site
(`BUILTIN_PROTOCOLS` in `registerProtocols.ts`) and applied through the
registration's declaration — `register(protocol, opts?, { slots?, rules? })`:
a module ships a protocol, its slot fitness, and its matching rules as one
call, the knowledge sitting with its author.
`ProtocolRegistry` forwards a declaration to the mapper under the same
options (overriding a protocol overrides its declaration);
`assetMapping.registerRule`/`registerSlots` remain the explicit
lower-level path for rules and slots that register separately. The mapper
itself starts empty; the protocols register their rules and slots.

## Consequences

- A module ships a protocol plus its matching rule and slot declaration;
  assets reach it without any STAC-specific import. The acceptance
  fixture (a consumer rule steering a demo-catalog item end-to-end)
  lives in `demoCatalog.test.ts`.
- Rules are identified by nothing but priority: two rules claiming the
  same asset at the same priority are separated by registration order —
  documented, deterministic, and invisible unless deliberately arranged.
- One asset yields one assignment: the first claiming rule wins it
  entirely; fitness competition happens between assets, never between
  rules over the same asset.
- Future source adapters (non-STAC) reuse `mapAssets` through the same
  port — the seam is source-neutral by construction.
