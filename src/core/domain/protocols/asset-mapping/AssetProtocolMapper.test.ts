import { describe, expect, it, vi } from "vitest";
import type {
    AssetRule,
    ProtocolAssignment,
    SourceAsset,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { AssetProtocolMapper } from "./AssetProtocolMapper";

const DEFAULT_HREF = "https://example.test/data";

const asset = (overrides: Partial<SourceAsset>): SourceAsset => ({
    href: DEFAULT_HREF,
    ...overrides,
});

/** A rule claiming assets by one role, assigning a fixed protocol id. */
function roleRule(
    priority: number,
    role: string,
    protocolId: string,
): AssetRule {
    return {
        priority,
        canResolve: (a) => a.roles?.includes(role) ?? false,
        resolve: (a): ProtocolAssignment => ({
            protocolId,
            sourceUrl: a.href,
            params: a.title ? { title: a.title } : {},
        }),
    };
}

/** A mapper whose slots table names only the fixture protocols. */
function mapper(
    slots: Record<string, Partial<Record<"renderer" | "data", number>>> = {
        visual: { renderer: 100 },
        alt: { renderer: 50 },
        both: { renderer: 70, data: 90 },
    },
): AssetProtocolMapper {
    return new AssetProtocolMapper(slots);
}

describe("AssetProtocolMapper", () => {
    it("the lower priority number claims the asset first", () => {
        const m = mapper();
        m.registerRule(roleRule(20, "tile", "visual"));
        m.registerRule(roleRule(10, "tile", "alt"));

        const result = m.mapAssets({
            a: asset({ roles: ["tile"] }),
        });

        expect(result?.renderer?.protocolId).toBe("alt");
    });

    it("registration order breaks a priority tie", () => {
        const m = mapper();
        m.registerRule(roleRule(10, "tile", "visual"));
        m.registerRule(roleRule(10, "tile", "alt"));

        const result = m.mapAssets({
            a: asset({ roles: ["tile"] }),
        });

        expect(result?.renderer?.protocolId).toBe("visual");
    });

    it("the best slot fitness wins; a tie keeps the earlier asset", () => {
        const m = mapper();
        m.registerRule(roleRule(10, "hi", "visual"));
        m.registerRule(roleRule(20, "lo", "alt"));
        const LO_URL = "https://example.test/lo";
        const HI_URL = "https://example.test/hi";

        const result = m.mapAssets({
            first: asset({ roles: ["lo"], href: LO_URL }),
            second: asset({ roles: ["hi"], href: HI_URL }),
        });

        expect(result?.renderer?.sourceUrl).toBe(HI_URL);

        const tie = m.mapAssets({
            first: asset({ roles: ["lo"], href: LO_URL }),
            second: asset({ roles: ["lo"], href: "https://example.test/lo2" }),
        });
        expect(tie?.renderer?.sourceUrl).toBe(LO_URL);
    });

    it("one protocol may serve both slots", () => {
        const m = mapper();
        m.registerRule(roleRule(10, "dual", "both"));

        const result = m.mapAssets({
            a: asset({ roles: ["dual"] }),
        });

        expect(result?.renderer?.protocolId).toBe("both");
        expect(result?.data?.protocolId).toBe("both");
    });

    it("an assignment whose protocol serves no slot becomes a report row", () => {
        const m = mapper();
        m.registerRule(roleRule(10, "tile", "ghost"));

        const result = m.mapAssets({
            a: asset({ roles: ["tile"], title: "The ghost" }),
        });

        expect(result?.renderer).toBeUndefined();
        expect(result?.data).toBeUndefined();
        expect(result?.relatedObjects).toEqual([
            {
                id: "ghost",
                title: "The ghost",
                type: "report",
                sourceUrl: DEFAULT_HREF,
            },
        ]);
    });

    it("returns null when no rule claims any asset", () => {
        const m = mapper();
        m.registerRule(roleRule(10, "tile", "visual"));

        expect(m.mapAssets({ a: asset({ roles: ["other"] }) })).toBeNull();
    });

    it("registerSlots duplicates throw unless overridden", () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const m = mapper();
        m.registerSlots("custom", { renderer: 10 });

        expect(() => m.registerSlots("custom", { renderer: 20 })).toThrow(
            /already registered/,
        );

        m.registerSlots("custom", { renderer: 20 }, { override: true });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('overriding "custom"'),
        );

        m.registerRule(roleRule(10, "tile", "custom"));
        const result = m.mapAssets({ a: asset({ roles: ["tile"] }) });
        expect(result?.renderer).toBeDefined();

        warn.mockRestore();
    });

    it("registered slots change slot selection live", () => {
        const m = mapper();
        m.registerRule(roleRule(10, "tile", "challenger"));
        m.registerRule(roleRule(20, "base", "visual"));
        m.registerSlots("challenger", { renderer: 60 });

        const before = m.mapAssets({
            a: asset({ roles: ["tile"] }),
            b: asset({ roles: ["base"] }),
        });
        expect(before?.renderer?.protocolId).toBe("visual");

        m.registerSlots("challenger", { renderer: 120 }, { override: true });
        const after = m.mapAssets({
            a: asset({ roles: ["tile"] }),
            b: asset({ roles: ["base"] }),
        });
        expect(after?.renderer?.protocolId).toBe("challenger");
    });
});
