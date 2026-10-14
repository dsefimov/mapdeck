import { beforeEach, describe, expect, it, vi } from "vitest";
import { WfsAttributeAdapter } from "./WfsAttributeAdapter";
import type { ProtocolBinding } from "@core/contracts";

const fetchWfsPageAsFeatures = vi.fn(async () => ({
    features: [],
    totalFeatures: 0,
}));

vi.mock(".", () => ({
    fetchWfsPageAsFeatures: (
        ...args: Parameters<typeof fetchWfsPageAsFeatures>
    ) => fetchWfsPageAsFeatures(...args),
}));

const binding: ProtocolBinding = {
    protocolId: "wfs",
    sourceUrl: "https://wfs.example.test/service",
    params: {},
};

beforeEach(() => {
    fetchWfsPageAsFeatures.mockClear();
});

describe("WfsAttributeAdapter", () => {
    it("requests the page in EPSG:4326 — row bboxes must be degrees", async () => {
        const adapter = new WfsAttributeAdapter();

        await adapter.fetchAttributes(binding, {});

        expect(fetchWfsPageAsFeatures).toHaveBeenCalledWith(
            expect.objectContaining({ srsName: "EPSG:4326" }),
            undefined,
        );
    });

    it("maps the table request onto the page request", async () => {
        const adapter = new WfsAttributeAdapter();

        await adapter.fetchAttributes(binding, {
            startIndex: 100,
            maxFeatures: 25,
            sortBy: "name",
            sortDirection: "desc",
        });

        expect(fetchWfsPageAsFeatures).toHaveBeenCalledWith(
            expect.objectContaining({
                startIndex: 100,
                maxFeatures: 25,
                sortBy: "name",
                sortDirection: "desc",
            }),
            undefined,
        );
    });

    it("keeps the version from the layer binding", async () => {
        const adapter = new WfsAttributeAdapter();
        const versioned: ProtocolBinding = {
            ...binding,
            params: { version: "1.1.0" },
        };

        await adapter.fetchAttributes(versioned, {});

        expect(fetchWfsPageAsFeatures).toHaveBeenCalledWith(
            expect.objectContaining({ version: "1.1.0" }),
            undefined,
        );
    });
});
