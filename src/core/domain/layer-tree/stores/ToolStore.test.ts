import { describe, expect, it } from "vitest";
import { ToolStore } from "./ToolStore";
import type { LayerTool } from "@core/contracts";
import { layerNode, protocolBinding } from "../logic/structure/__testFactories";
import type { StoreRegistry } from "@core/store-registry";

/** Minimal LayerTool for tests. */
function tool(id: string): LayerTool {
    return { id, component: () => null };
}

const createStore = () =>
    new ToolStore({
        localeStore: { registerTranslations: () => undefined },
    } as unknown as StoreRegistry);

describe("ToolStore", () => {
    it("registering a tool auto-registers its translations", () => {
        const registered: Array<[string, unknown]> = [];
        const store = new ToolStore({
            localeStore: {
                registerTranslations: (
                    id: string,
                    translations: unknown,
                ) => registered.push([id, translations]),
            },
        } as unknown as StoreRegistry);
        const translations = { en: { "tool.name": "Raster Opacity" } };

        store.registerTool({
            id: "t1",
            component: () => null,
            localeTranslations: translations,
        });

        expect(registered).toEqual([["t1", translations]]);
    });

    it("registration without translations skips the locale registration", () => {
        let calls = 0;
        const store = new ToolStore({
            localeStore: {
                registerTranslations: () => {
                    calls += 1;
                },
            },
        } as unknown as StoreRegistry);

        store.registerTool(tool("plain"));

        expect(calls).toBe(0);
    });


    it("resolves a node's capabilities to tool instances in list order", () => {
        const store = createStore();
        store.registerTool(tool("size"));
        store.registerTool(tool("opacity"));
        const node = layerNode("1", {
            renderer: protocolBinding({ protocolId: "wms" }),
            capabilities: [
                { toolId: "opacity", slot: "renderer" },
                { toolId: "size", slot: "renderer" },
            ],
        });

        expect(store.getToolsForNode(node).map((tl) => tl.id)).toEqual([
            "opacity",
            "size",
        ]);
    });

    it("deduplicates a tool assigned by both slots", () => {
        const store = createStore();
        store.registerTool(tool("dual"));
        const node = layerNode("1", {
            renderer: protocolBinding({ protocolId: "wms" }),
            data: protocolBinding({ protocolId: "wfs" }),
            capabilities: [
                { toolId: "dual", slot: "renderer" },
                { toolId: "dual", slot: "data" },
            ],
        });

        expect(store.getToolsForNode(node).map((tl) => tl.id)).toEqual(["dual"]);
    });

    it("skips capabilities whose tool id is not registered", () => {
        const store = createStore();
        store.registerTool(tool("real"));
        const node = layerNode("1", {
            renderer: protocolBinding({ protocolId: "wms" }),
            capabilities: [
                { toolId: "ghost", slot: "renderer" },
                { toolId: "real", slot: "renderer" },
            ],
        });

        expect(store.getToolsForNode(node).map((tl) => tl.id)).toEqual([
            "real",
        ]);
    });

    it("returns no tools for a node without capabilities", () => {
        const store = createStore();
        store.registerTool(tool("raster"));
        store.bindToolToProtocol("wms", "renderer", "raster");

        const node = layerNode("1", {
            renderer: protocolBinding({ protocolId: "wms" }),
        });
        expect(store.getToolsForNode(node)).toEqual([]);
    });

    it("throws when registering a duplicate tool id", () => {
        const store = createStore();
        store.registerTool(tool("dup"));
        expect(() => store.registerTool(tool("dup"))).toThrow(
            /already registered/,
        );
    });

    it("throws when binding a tool id that is not registered", () => {
        const store = createStore();
        expect(() =>
            store.bindToolToProtocol("wms", "renderer", "unknown"),
        ).toThrow(/no such tool/);
    });

    it("boundProtocolIds unions both roles and deduplicates", () => {
        const store = createStore();
        store.registerTool(tool("dual"));
        store.bindToolToProtocol("wms", "renderer", "dual");
        store.bindToolToProtocol("wfs", "data", "dual");
        expect(store.boundProtocolIds).toEqual(["wms", "wfs"]);
    });

    it("boundProtocolIds is empty before any binding", () => {
        const store = createStore();
        expect(store.boundProtocolIds).toEqual([]);
    });
});
