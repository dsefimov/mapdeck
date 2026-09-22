import { afterEach, describe, expect, it, vi } from "vitest";
import type { BaseMapConfig } from "@core/contracts";
import { checkBasemapHealth } from "./checkBasemapHealth";

const BASEMAP: BaseMapConfig = {
    id: "bm",
    name: "Probe target",
    style: {
        version: 8,
        sources: {
            tiles: { type: "raster", tiles: ["https://tiles.example/{z}/{x}/{y}.png"] },
        },
        layers: [],
    },
};

function stubStatus(status: number): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: status >= 200 && status < 300, status })),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("checkBasemapHealth", () => {
    it.each([200, 206])("status %i is healthy", async (status) => {
        stubStatus(status);
        await expect(checkBasemapHealth(BASEMAP)).resolves.toBe(true);
    });

    it.each([405, 501])(
        "status %i — HEAD unsupported, server still reachable — is healthy",
        async (status) => {
            stubStatus(status);
            await expect(checkBasemapHealth(BASEMAP)).resolves.toBe(true);
        },
    );

    it.each([404, 500])("status %i is unhealthy", async (status) => {
        stubStatus(status);
        await expect(checkBasemapHealth(BASEMAP)).resolves.toBe(false);
    });

    it("a network failure is unhealthy", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("connection refused");
            }),
        );
        await expect(checkBasemapHealth(BASEMAP)).resolves.toBe(false);
    });

    it("probes the 0/0/0 tile of the first source", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await checkBasemapHealth(BASEMAP);

        expect(fetchMock).toHaveBeenCalledWith(
            "https://tiles.example/0/0/0.png",
            expect.objectContaining({ method: "HEAD" }),
        );
    });
});
