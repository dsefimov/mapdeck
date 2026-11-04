import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Getter } from "copc";
import {
    createBoundedGetter,
    createHttpRangeGetter,
} from "./boundedGetter";

const TIMEOUT_MS = 30_000;
const URL = "https://example.com/cloud.copc.laz";

/** A fetch stand-in that never settles on its own — only a signal ends it. */
function hangingFetch(): (
    url: string,
    init: { signal?: AbortSignal },
) => Promise<Response> {
    return (_url, init) =>
        new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
            });
        });
}

function bodyFetch(body: Uint8Array): ReturnType<typeof hangingFetch> {
    return vi.fn(async () => {
        const ab = body.buffer.slice(
            body.byteOffset,
            body.byteOffset + body.byteLength,
        );
        return { arrayBuffer: async () => ab } as unknown as Response;
    });
}

describe("createBoundedGetter over an HTTP source", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    it("requests an inclusive byte range, like copc's own HTTP getter", async () => {
        fetchMock.mockImplementation(bodyFetch(new Uint8Array([1, 2, 3])));

        const getter = createBoundedGetter(
            URL,
            new AbortController().signal,
            TIMEOUT_MS,
        );
        await getter(0, 100);

        const [calledUrl, init] = fetchMock.mock.calls[0] as [
            string,
            { headers: Record<string, string>; cache?: RequestCache },
        ];
        expect(calledUrl).toBe(URL);
        expect(init.headers.Range).toBe("bytes=0-99");
        // Range bytes are unique — the disk cache re-uses nothing, and a
        // cached 206 can fail outright in Chrome. Never store ranges.
        expect(init.cache).toBe("no-store");
    });

    it("returns the response body as bytes", async () => {
        fetchMock.mockImplementation(bodyFetch(new Uint8Array([9, 8, 7, 6])));

        const bytes = await createBoundedGetter(
            URL,
            new AbortController().signal,
            TIMEOUT_MS,
        )(50, 54);

        expect(bytes).toEqual(new Uint8Array([9, 8, 7, 6]));
    });

    it("rejects with a timeout error when the server hangs", async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(hangingFetch());

        const getter = createBoundedGetter(
            URL,
            new AbortController().signal,
            TIMEOUT_MS,
        );
        const loaded = expect(getter(0, 10)).rejects.toThrow(/timed out/);

        vi.advanceTimersByTime(TIMEOUT_MS + 1);
        await loaded;
        vi.useRealTimers();
    });

    it("rejects with an AbortError when the caller cancels the load", async () => {
        fetchMock.mockImplementation(hangingFetch());
        const controller = new AbortController();

        const loaded = createBoundedGetter(
            URL,
            controller.signal,
            TIMEOUT_MS,
        )(0, 10);
        const cancelled = expect(loaded).rejects.toMatchObject({
            name: "AbortError",
        });

        controller.abort();
        await cancelled;
    });
});

describe("createBoundedGetter over a buffer source", () => {
    it("passes the getter through untouched — memory cannot hang", () => {
        const source: Getter = async () => new Uint8Array(0);

        expect(createBoundedGetter(source, new AbortController().signal, 1)).toBe(
            source,
        );
    });
});

describe("createHttpRangeGetter", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    it("sends the range, no-store and no caller signal", async () => {
        fetchMock.mockImplementation(bodyFetch(new Uint8Array([1, 2, 3])));

        await createHttpRangeGetter(URL, TIMEOUT_MS)(0, 100);

        const [calledUrl, init] = fetchMock.mock.calls[0] as [
            string,
            {
                headers: Record<string, string>;
                cache?: RequestCache;
                signal?: AbortSignal;
            },
        ];
        expect(calledUrl).toBe(URL);
        expect(init.headers.Range).toBe("bytes=0-99");
        expect(init.cache).toBe("no-store");
        // No per-load channel for the header/hierarchy reads: the ceiling is
        // the only bound, and the getter must not fabricate a signal.
        expect(init.signal).toBeDefined();
    });

    it("rejects with a timeout error when the server hangs", async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(hangingFetch());

        const loaded = expect(
            createHttpRangeGetter(URL, TIMEOUT_MS)(0, 10),
        ).rejects.toThrow(/timed out/);

        vi.advanceTimersByTime(TIMEOUT_MS + 1);
        await loaded;
        vi.useRealTimers();
    });
});
