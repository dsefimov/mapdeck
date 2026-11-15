import { describe, it, expect } from "vitest";
import type { NodeCapability } from "@core/contracts";
import { isCapabilityImplemented } from "./isCapabilityImplemented";

const links = new Set([
    "wms|renderer|opacity",
    "wfs|data|attributes",
    "copc|renderer|size",
]);
const hasLink = (p: string, s: string, t: string): boolean =>
    links.has(`${p}|${s}|${t}`);

const bindings = {
    renderer: { protocolId: "wms", sourceUrl: "u", params: {} },
    data: { protocolId: "wfs", sourceUrl: "u", params: {} },
};

describe("isCapabilityImplemented", () => {
    it.each([
        [
            "a link on the renderer binding exists",
            { toolId: "opacity", slot: "renderer" },
            true,
        ],
        [
            "a link on the data binding exists",
            { toolId: "attributes", slot: "data" },
            true,
        ],
        [
            "no link exists for the tool id",
            { toolId: "unknown-tool", slot: "renderer" },
            false,
        ],
        [
            "the protocol has no link in that slot",
            { toolId: "opacity", slot: "data" },
            false,
        ],
    ])("returns %p when %s", (_label, capability, expected) => {
        expect(
            isCapabilityImplemented(
                capability as NodeCapability,
                bindings,
                hasLink,
            ),
        ).toBe(expected);
    });

    it("a capability whose slot has no binding is unimplemented", () => {
        expect(
            isCapabilityImplemented(
                { toolId: "attributes", slot: "data" },
                {
                    renderer: bindings.renderer,
                    data: undefined,
                },
                hasLink,
            ),
        ).toBe(false);
    });
});
