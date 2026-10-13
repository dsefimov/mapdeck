# ADR-0018: Asset→protocol mapping is a kernel domain — the `assetMapping` port

## Context

Which protocol serves a tree node used to be decided inside the STAC
module: a role-resolver registry and a protocol-slot fitness table lived
in `src/modules/stac/`, invisible to everyone else. A consumer could
register a protocol (`context.protocols.register`) but could not route
any asset to it — no matching rule, no fitness entry (`unknown protocol
id → report row`). Terrain-3D and WFS-3D protocols would render nothing.

The mapping is not STAC-specific. Its input — an asset: a tagged
resource at a URL — is source-neutral, and the fitness table ("which
protocol serves which slot") is knowledge about protocols, sitting in a
module about a source. A port on the STAC module was rejected: it would
tie every protocol module to STAC. The seam belongs in the protocols
domain, where protocol modules already register.

## Decision

**A kernel mapper, one declared point.** `AssetProtocolMapper`
(`src/core/domain/protocols/asset-mapping/`) generalizes the registry,
the table, and the selection logic (pure, in `logic/`).
`ModuleContext.assetMapping` (`AssetMappingPort`, contracts) exposes:

- `registerRule(rule: AssetRule)` — the matching chain, priority-ordered
  (lower first, registration order breaks ties);
- `registerSlots(protocolId, slots, opts?)` — a protocol's slot fitness,
  under the common duplicate policy (throw, `{ override: true }` + warn);
- `mapAssets(assets, options?)` — what source adapters call at fetch
  time: the first claiming rule wins each asset, the best slot fitness
  wins each slot (ties keep the earlier asset), slot-less assignments
  become report rows, `null` when nothing matched.

One port for both directions: today the only `mapAssets` reader is a
module's own source adapter (STAC), so a read/write split would have a
single-consumer read side.

**Neutral contracts.** `SourceAsset` (open index signature carries
source-specific fields; the kernel never reads them), `AssetContext`
(the owning entity's per-asset context), `AssetRule`,
`ProtocolAssignment`, `AssetMappingResult` — all in
`contracts/domain/asset-mapping.ts`, exported through
`mapdeck/contracts`. The STAC module's resolvers became plain rules over
these types; their vocabulary (roles, MIME heuristics) stays STAC-side.

**Boot freshness instead of idempotency guards.** The mapper is created
by `RootStore`, not observable (registration finishes before any
observer renders; mapping runs in fetch flows). A restart builds a
fresh store — a fresh mapper — and bootstrap re-registers the built-in
rules; the STAC module's old `resolversRegistered` guard became dead
weight and was removed.

**Default slots live with the protocols.** The built-in fitness values are
declared at each built-in protocol's registration site
(`BUILTIN_PROTOCOLS` in `registerProtocols.ts`) and applied through the
registration's declaration — `register(protocol, opts?, { slots?, rules? })`.
`ProtocolRegistry` forwards a declaration to the mapper under the same
options (overriding a protocol overrides its declaration). The mapper
itself starts empty: the kernel holds the mechanism, the protocols hold
the knowledge. The former STAC fitness table no longer exists anywhere.

**Amended 2026-10-13 (same change set): declaration sugar.** The
`register` third parameter landed together with the mapper — a module
ships a protocol, its slot fitness, and its matching rules as one
declaration; `assetMapping.registerRule`/`registerSlots` remain the
explicit lower-level path.

Why a new ADR rather than amending 0004/0005: ADR-0004 describes the
context family's shape (this adds one member of the already-decided
kind — not a new shape); ADR-0005 governs registration order and the
duplicate policy (both reused as-is). The decision here — mapping
changes owner from a source module to the protocols domain — is a
concept neither record hosts.

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
