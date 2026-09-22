import { describe, expect, it, vi } from "vitest";

import { boundedFetch } from "./boundedFetch";

function okResponse(): Response {
    return { ok: true, status: 200 } as unknown as Response;
}

describe("boundedFetch", () => {
    it("returns the response when the server answers in time", async () => {
        const fetchMock = vi.fn(async () => okResponse());
        vi.stubGlobal("fetch", fetchMock);

        const response = await boundedFetch("https://x.io/data", {
            headers: { Accept: "application/geo+json" },
        });

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://x.io/data",
            expect.objectContaining({
                headers: { Accept: "application/geo+json" },
            }),
        );
        vi.unstubAllGlobals();
    });

    it("rejects with a timeout error when the ceiling is hit", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: { signal?: AbortSignal }) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () =>
                            reject(new Error("Aborted")),
                        );
                    }),
            ),
        );

        await expect(
            boundedFetch("https://x.io/slow", { timeoutMs: 10 }),
        ).rejects.toThrow("Request timed out after 10ms");
        vi.unstubAllGlobals();
    });

    it("rethrows a network error as-is even when a ceiling is armed", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );

        const error: unknown = await boundedFetch(
            "https://x.io/unreachable",
            { timeoutMs: 10_000 },
        ).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(TypeError);
        expect((error as TypeError).message).toBe("Failed to fetch");
        vi.unstubAllGlobals();
    });

    it("reports a timeout when the ceiling fires while the caller's signal is attached but intact", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: { signal?: AbortSignal }) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () =>
                            reject(new Error("Aborted")),
                        );
                    }),
            ),
        );

        const controller = new AbortController();
        await expect(
            boundedFetch("https://x.io/slow", {
                timeoutMs: 10,
                signal: controller.signal,
            }),
        ).rejects.toThrow("Request timed out after 10ms");
        vi.unstubAllGlobals();
    });

    it("propagates the caller's abort as-is, not as a timeout", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: { signal?: AbortSignal }) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () =>
                            reject(new Error("Aborted")),
                        );
                    }),
            ),
        );

        const controller = new AbortController();
        const pending = boundedFetch("https://x.io/hang", {
            timeoutMs: 5_000,
            signal: controller.signal,
        });
        controller.abort();

        await expect(pending).rejects.toThrow("Aborted");
        await expect(
            (pending as Promise<unknown>).catch(() => null),
        ).resolves.toBeNull();
        vi.unstubAllGlobals();
    });
});
