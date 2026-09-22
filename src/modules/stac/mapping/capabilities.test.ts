import { describe, it, expect } from "vitest";
import type { ProtocolBinding, LayerTool } from "@core/contracts";
import { ToolStore } from "@core/domain/layer-tree";
import type { StoreRegistry } from "@core/store-registry";
import { assignCapabilities, type CapabilitySource } from "./capabilities";

const tool = (id: string): LayerTool => ({ id, component: () => null });

const WFS_DATA_LINK = "wfs|data|attributes";

const binding = (protocolId: string): ProtocolBinding => ({
    protocolId,
    sourceUrl: "https://example.test",
    params: {},
});

/** Tool-link table stub: entries are "protocolId|slot|toolId" strings. */
function source(links: string[]): CapabilitySource {
    const table = new Set(links);
    return {
        linkedToolIds: (protocolId, slot) =>
            [...table]
                .filter((l) => l.startsWith(`${protocolId}|${slot}|`))
                .map((l) => l.split("|")[2]!),
        hasLink: (protocolId, slot, toolId) =>
            table.has(`${protocolId}|${slot}|${toolId}`),
    };
}

describe("assignCapabilities", () => {
    it("offers every linked tool of the resolved bindings", () => {
        const { capabilities } = assignCapabilities(
            { renderer: binding("wms"), data: binding("wfs") },
            source(["wms|renderer|opacity", WFS_DATA_LINK]),
        );
        expect(capabilities).toEqual([
            { toolId: "opacity", slot: "renderer" },
            { toolId: "attributes", slot: "data" },
        ]);
    });

    it("renderer candidates come before data candidates", () => {
        const { capabilities } = assignCapabilities(
            { renderer: binding("wms"), data: binding("wfs") },
            source([WFS_DATA_LINK, "wms|renderer|opacity"]),
        );
        expect(capabilities.map((c) => c.toolId)).toEqual([
            "opacity",
            "attributes",
        ]);
    });

    it("drops unimplemented candidates and reports them", () => {
        // A link that exists for the candidate derivation but not for
        // verification cannot happen with one table — simulate a divergent
        // source to pin the gate.
        const divergent: CapabilitySource = {
            ...source([]),
            linkedToolIds: () => ["ghost"],
        };
        const { capabilities, unimplemented } = assignCapabilities(
            { renderer: binding("copc") },
            divergent,
        );
        expect(capabilities).toEqual([]);
        expect(unimplemented).toEqual([{ toolId: "ghost", slot: "renderer" }]);
    });

    it("skips duplicate tool ids across slots — first slot wins", () => {
        const { capabilities } = assignCapabilities(
            { renderer: binding("ogc-features"), data: binding("ogc-features") },
            source(["ogc-features|renderer|table", "ogc-features|data|table"]),
        );
        expect(capabilities).toEqual([{ toolId: "table", slot: "renderer" }]);
    });

    it("a slot without a binding contributes no candidates", () => {
        const { capabilities } = assignCapabilities(
            { renderer: binding("copc") },
            source(["wfs|data|attributes"]),
        );
        expect(capabilities).toEqual([]);
    });

    it("works against a real ToolStore — its methods keep their this", () => {
        // Regression: passing the store's method as a bare callback used to
        // detach `this` and crash every item fetch.
        const store = new ToolStore({
            localeStore: { registerTranslations: () => undefined },
        } as unknown as StoreRegistry);
        store.registerTool(tool("opacity"));
        store.registerTool(tool("attributes"));
        store.bindToolToProtocol("wms", "renderer", "opacity");
        store.bindToolToProtocol("wfs", "data", "attributes");

        const { capabilities, unimplemented } = assignCapabilities(
            { renderer: binding("wms"), data: binding("wfs") },
            store,
        );

        expect(unimplemented).toEqual([]);
        expect(capabilities).toEqual([
            { toolId: "opacity", slot: "renderer" },
            { toolId: "attributes", slot: "data" },
        ]);
    });
});
