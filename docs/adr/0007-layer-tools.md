# ADR-0007: Layer tools — protocol-bound actions in the layer tree

## Context

Layer tools are the layer-tree extension point: per-node actions (opacity slider, point
size, color scheme, attribute table) rendered in the "More" menu of a layer node. A
node's tool set depends on the node itself — nodes carry protocol bindings and an
assigned capability list (ADR-0009), and a tool applies to some protocols but not
others. The mapping between tools and nodes is therefore two-layered: the source decides
which capabilities a node offers, and the link table records which tool implements a
capability for which protocol. This ADR records the link mechanism and how a layer tool
is authored; the capability model belongs to ADR-0009.

## Decision

**A layer tool is a class instance (ADR-0004) carrying only identity, presentation, and
translations.** `id` (also the locale namespace), a `component` factory, optional
`localeTranslations`. No lifecycle, no placement declaration: a layer tool is a passive
record that says nothing about where it appears. The `component` factory receives
`nodeId: string` — the tool registers once at startup, before any node exists, so it
cannot close over a node; it receives the node identity at render time, and the component
pulls the node's configuration from the tree store and renders controls that write it
back.

**Protocol bindings are the single implementation mechanism.** A tool becomes usable on
a node only through `layerToolStore.bindToolToProtocol(protocolId, slot, toolId)`, where
`slot` is `"renderer"` or `"data"` — the node's task the tool performs with that
protocol: map rendering or attribute access. The links are established in the tool's own
registration function, next to the tool definition, so a tool's applicability is
discoverable at its definition site. The link table is what the capability check at
assignment verifies against (ADR-0009). There is no second path: a tool cannot declare
applicability on itself. Why one mechanism: two mechanisms drift apart; here the tool
and its applicability are written in one place.

**Availability comes from the node's capabilities; links are consulted at assignment, not
at the menu.** The store keeps registered tools in an id registry and links in two
slot-specific groups (renderer, data). `getToolsForNode(node)` resolves the node's
assigned capabilities (ADR-0009) to tool instances in list order, deduplicated by id — a
capability assigned under both slots appears once. A link without a matching assigned capability never
reaches the menu: that is the source's assignment decision, not an accident.

**Registration follows the extension policy.** Core tools register explicitly in
`layer-tools/registerTools.ts`; module tools register through their `register(context)`
using the same store, and a module may link an existing tool to a new protocol by its id
string without importing the tool. Duplicate tool ids throw (ADR-0005 duplicate policy);
binding an unregistered tool id throws at bind time, and a binding whose protocol id is
not registered throws at the end of bootstrap — after all registrations, including
modules — so a typo in either id surfaces at startup. Adding the same binding twice is
idempotent — the one legitimate silent skip in the registry lib. The protocol check runs
last because protocol registrations arrive after tool bindings: core protocols register
later in bootstrap, and module protocols later still. Linking by id string is the accepted trade-off: it keeps the dependency direction
extension → core and is verified at startup, at the cost of type safety on the link.

**Translations travel with the tool.** The tool object carries `localeTranslations`; the
store registers them with the locale store under the tool id at registration — the same
auto-registration widgets use. The translation dictionary format and the fallback chain
belong to the locale area.

**Flat registration, no lazy loading.** All layer tools register at init. Accepted: the
tool count is small, and ADR-0004 records the same consequence for extensions generally.

## Consequences

- A new node with a known protocol gets its tools without any tool changes once the
  source assigns the capabilities — availability is derived entirely from the node's
  assigned capabilities.
- Adding a tool for a protocol means one registration function: define, register, bind,
  translate — in one file, discoverable next to the tool.
- Modules extend the tool set by protocol link without importing core tools.
- A tool is missing on a node either because the source did not assign its capability or
  because the assignment check found no link — the latter logs a warning at assignment;
  a typo in a tool id or a protocol id in a link fails loudly at startup.
