import { describe, expect, it } from "vitest";
import { recordNodeDepth } from "./depthDistribution";

describe("recordNodeDepth", () => {
    it("counts the first node of a depth from zero", () => {
        const distribution = new Map<number, number>();

        recordNodeDepth(distribution, 0, 2);

        expect(distribution.get(2)).toBe(1);
    });

    it("accumulates every further node of the same depth", () => {
        const distribution = new Map<number, number>();

        recordNodeDepth(distribution, 0, 2);
        recordNodeDepth(distribution, 2, 2);
        recordNodeDepth(distribution, 2, 2);

        expect(distribution.get(2)).toBe(3);
    });

    it("tracks depths independently", () => {
        const distribution = new Map<number, number>();

        recordNodeDepth(distribution, 0, 1);
        recordNodeDepth(distribution, 1, 4);
        recordNodeDepth(distribution, 4, 1);

        expect(distribution.get(1)).toBe(2);
        expect(distribution.get(4)).toBe(1);
    });

    it("raises the watermark when a deeper node arrives", () => {
        const distribution = new Map<number, number>();

        expect(recordNodeDepth(distribution, 3, 5)).toBe(5);
    });

    it("keeps the watermark when a shallower node arrives", () => {
        const distribution = new Map<number, number>();

        expect(recordNodeDepth(distribution, 5, 2)).toBe(5);
    });
});
