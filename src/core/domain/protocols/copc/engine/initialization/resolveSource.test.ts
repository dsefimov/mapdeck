import { afterEach, describe, expect, it, vi } from "vitest";
import { createBufferGetter, resolveUrl } from "./resolveSource";

const RELATIVE = "data/cloud.copc.laz";
const ORIGIN = "https://example.com";

/** Stand in for a page the loader is running on. */
function servedFrom(origin: string): void {
    vi.stubGlobal("window", { location: { origin } });
}

describe("resolveUrl", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each([
        `${ORIGIN}/cloud.copc.laz`,
        "http://example.com/cloud.copc.laz",
    ])("leaves an absolute url alone: %s", (url) => {
        servedFrom(ORIGIN);

        expect(resolveUrl(url)).toBe(url);
    });

    it("hands an absolute url back verbatim, without the tidying a re-parse would do", () => {
        servedFrom(ORIGIN);

        expect(resolveUrl(ORIGIN)).toBe(ORIGIN);
    });

    it("joins a relative path against the page it is served from", () => {
        servedFrom(ORIGIN);

        expect(resolveUrl(RELATIVE)).toBe(`${ORIGIN}/${RELATIVE}`);
    });

    it("hands back the plain path when the page has no usable origin", () => {
        servedFrom("null");

        expect(resolveUrl(RELATIVE)).toBe(RELATIVE);
    });

    it("hands back the plain path off the main thread, where no page exists", () => {
        expect(resolveUrl(RELATIVE)).toBe(RELATIVE);
    });
});

describe("createBufferGetter", () => {
    /** Eight bytes counting up, plus a view for reaching back into them. */
    function bytes(): { buffer: ArrayBuffer; view: Uint8Array } {
        const buffer = new ArrayBuffer(8);
        const view = new Uint8Array(buffer);
        view.set([0, 1, 2, 3, 4, 5, 6, 7]);
        return { buffer, view };
    }

    it("hands out the requested byte range", async () => {
        const get = createBufferGetter(bytes().buffer);

        await expect(get(2, 5)).resolves.toEqual(new Uint8Array([2, 3, 4]));
    });

    it("copies the range, so a later write to the source cannot reach it", async () => {
        const { buffer, view } = bytes();
        const get = createBufferGetter(buffer);

        const chunk = await get(0, 3);
        view[1] = 99;

        expect(chunk[1]).toBe(1);
    });

    it("stops at the end of the buffer rather than overrunning it", async () => {
        const get = createBufferGetter(bytes().buffer);

        await expect(get(6, 100)).resolves.toEqual(new Uint8Array([6, 7]));
    });

    it("returns nothing for an empty range", async () => {
        const get = createBufferGetter(bytes().buffer);

        await expect(get(4, 4)).resolves.toEqual(new Uint8Array([]));
    });
});
