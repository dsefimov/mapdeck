import { describe, expect, it } from "vitest";
import type { Protocol, SourceAsset } from "@core/contracts";
import { AssetProtocolMapper } from "../asset-mapping/AssetProtocolMapper";
import { ProtocolRegistry } from "./ProtocolRegistry";

/** A minimal protocol: identity is all the registry sees. */
function protocol(id: string): Protocol {
    return {
        id,
        label: id,
        defaultStyle: {},
        createRenderDescriptor: () => ({ sourceUrl: "", config: {} }),
        getLayerAdapter: (() => ({})) as Protocol["getLayerAdapter"],
    };
}

const cloudAsset: SourceAsset = {
    href: "https://example.test/cloud",
    roles: ["custom-cloud"],
};

const cloudRule = {
    priority: 5,
    canResolve: (a: SourceAsset) =>
        a.roles?.includes("custom-cloud") ?? false,
    resolve: (a: SourceAsset) => ({
        protocolId: "custom",
        sourceUrl: a.href,
        params: {},
    }),
};

function wired(): { registry: ProtocolRegistry; mapper: AssetProtocolMapper } {
    const mapper = new AssetProtocolMapper();
    return { registry: new ProtocolRegistry(mapper), mapper };
}

describe("ProtocolRegistry declaration", () => {
    it("applies declared slots and rules to the asset mapper", () => {
        const { registry, mapper } = wired();

        registry.register(protocol("custom"), undefined, {
            slots: { renderer: 100 },
            rules: [cloudRule],
        });

        const result = mapper.mapAssets({ cloud: cloudAsset });
        expect(result?.renderer?.protocolId).toBe("custom");
    });

    it("a protocol without a declaration maps nothing", () => {
        const { registry, mapper } = wired();

        registry.register(protocol("custom"));

        expect(mapper.mapAssets({ cloud: cloudAsset })).toBeNull();
    });

    it("overriding a protocol overrides its slots under the same options", () => {
        const { registry, mapper } = wired();
        registry.register(protocol("custom"), undefined, {
            slots: { renderer: 100 },
        });

        expect(() =>
            registry.register(protocol("custom"), undefined, {
                slots: { renderer: 50 },
            }),
        ).toThrow(/already registered/);

        registry.register(
            protocol("custom"),
            { override: true },
            { slots: { renderer: 50 }, rules: [cloudRule] },
        );

        const result = mapper.mapAssets({ cloud: cloudAsset });
        expect(result?.renderer?.protocolId).toBe("custom");
    });

    it("an empty declaration is a plain registration", () => {
        const { registry, mapper } = wired();

        expect(() =>
            registry.register(protocol("custom"), undefined, {}),
        ).not.toThrow();
        expect(mapper.mapAssets({ cloud: cloudAsset })).toBeNull();
    });
});
