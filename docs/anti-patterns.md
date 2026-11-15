# Anti-patterns

Recorded traps — shapes the codebase has already grown out of, kept here
so they are not reintroduced under a new name. Each entry names the
smell, the live example, and the corrective shape.

## Central knowledge tables about protocols

**Smell.** A central set/map answering "which protocols support X" —
knowledge about a protocol living outside the protocol itself. Every new
protocol must remember to edit the table (and a module author cannot:
the table is kernel-private), and an omitted id silently degrades to a
wrong default instead of failing to compile.

**Live example.** `src/core/domain/protocols/registerProtocols.ts` carries
`FEATURE_SERVED_PROTOCOLS` and `NATIVE_RENDER_PROTOCOLS` — knowledge the
protocols' own authors own, lifted into the composition root. Its comment
admits the workaround: "a new protocol adds its id here (at its own
registration site), never edits a provider."

**Corrective shape.** Capabilities are optional members of the `Protocol`
contract, declared where the protocol is defined — the existing
`fetchAttributes?` and `groupRenderUnits?` precedent, and
`featureSelection?` (ADR-0022). The consumer asks the registry and treats
absence as the honest "no". A new central set about protocols is a
red flag by default; if you think you need one, first check whether the
knowledge belongs on the protocol or its declaration
(`ProtocolDeclaration`).
