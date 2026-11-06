import { afterEach, describe, expect, it, vi } from "vitest";

import { boundedFetch, FetchTimeoutError } from "./boundedFetch";

function okResponse(): Response {
    return { ok: true, status: 200 } as unknown as Response;
}

/**
 * A fetch that never answers on its own: it rejects with the request
 * signal's abort reason, like the native fetch does.
 */
function hangingFetch() {
    return vi.fn(
        (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal;
                if (!signal) return;
                if (signal.aborted) {
                    reject(signal.reason);
                    return;
                }
                signal.addEventListener(
                    "abort",
                    () => reject(signal.reason),
                    { once: true },
                );
            }),
    );
}

describe("boundedFetch", () => {
    const SLOW_URL = "https://x.io/slow";
    afterEach(() => {
        vi.unstubAllGlobals();
    });

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
    });

    it("rejects with a timeout error when the ceiling is hit", async () => {
        vi.stubGlobal("fetch", hangingFetch());

        await expect(
            boundedFetch(SLOW_URL, { timeoutMs: 10 }),
        ).rejects.toThrow(FetchTimeoutError);
        await expect(
            boundedFetch(SLOW_URL, { timeoutMs: 10 }),
        ).rejects.toThrow("Request timed out after 10ms");
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
    });

    it("reports a timeout when the ceiling fires while the caller's signal is attached but intact", async () => {
        vi.stubGlobal("fetch", hangingFetch());

        const controller = new AbortController();
        await expect(
            boundedFetch(SLOW_URL, {
                timeoutMs: 10,
                signal: controller.signal,
            }),
        ).rejects.toThrow(FetchTimeoutError);
    });

    it("propagates the caller's abort as-is, not as a timeout", async () => {
        vi.stubGlobal("fetch", hangingFetch());

        const controller = new AbortController();
        const pending = boundedFetch("https://x.io/hang", {
            timeoutMs: 5_000,
            signal: controller.signal,
        });
        controller.abort();

        await expect(pending).rejects.toMatchObject({
            name: "AbortError",
        });
    });

    it("rejects immediately when the caller's signal is already aborted", async () => {
        vi.stubGlobal("fetch", hangingFetch());

        const controller = new AbortController();
        controller.abort();

        await expect(
            boundedFetch("https://x.io/hang", {
                signal: controller.signal,
            }),
        ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("keeps the ceiling armed while the caller reads the body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async (_url: string, init?: RequestInit) =>
                    ({
                        ok: true,
                        status: 200,
                        arrayBuffer: () =>
                            new Promise<ArrayBuffer>(
                                (_resolve, reject) => {
                                    const signal = init?.signal;
                                    if (!signal) return;
                                    signal.addEventListener(
                                        "abort",
                                        () => reject(signal.reason),
                                        { once: true },
                                    );
                                },
                            ),
                    }) as unknown as Response,
            ),
        );

        const response = await boundedFetch("https://x.io/slow-body", {
            timeoutMs: 10,
        });

        await expect(response.arrayBuffer()).rejects.toMatchObject({
            name: "TimeoutError",
        });
    });
});
