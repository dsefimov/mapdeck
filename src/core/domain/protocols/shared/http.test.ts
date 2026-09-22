import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChecked } from "./http";

afterEach(() => {
    vi.unstubAllGlobals();
});

function respond(ok: boolean, status: number, statusText: string): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok, status, statusText })),
    );
}

describe("fetchChecked", () => {
    it("returns the response on an ok status", async () => {
        respond(true, 200, "OK");

        const response = await fetchChecked("https://api.test/items", {
            label: "WFS GetFeature",
            timeoutMs: 1000,
        });

        expect(response.status).toBe(200);
    });

    it("throws with the caller's label and the status on failure", async () => {
        respond(false, 503, "Service Unavailable");

        await expect(
            fetchChecked("https://api.test/items", {
                label: "WFS GetFeature",
                timeoutMs: 1000,
            }),
        ).rejects.toThrow("WFS GetFeature returned 503 Service Unavailable");
    });
});
