import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hierarchy } from "copc";
import { HierarchyLoadTracker } from "./HierarchyLoadTracker";

vi.mock("copc", () => ({
    Hierarchy: { load: vi.fn() },
}));

const load = vi.mocked(Hierarchy.load);

const ROOT_KEY = "0-0-0-0";
const FIRST_NODE = "1-0-0-0";
const SECOND_NODE = "1-0-0-1";

const ROOT_PAGE = { key: ROOT_KEY } as unknown as Hierarchy.Page;
const CHILD_PAGE = { key: FIRST_NODE } as unknown as Hierarchy.Page;

const entry = { pointCount: 100, pointDataOffset: 0, pointDataLength: 1 };

/** A hierarchy page's worth of nodes, with no sub-pages below it. */
function subtree(
    keys: string[],
    pages: Record<string, Hierarchy.Page | undefined> = {},
): Hierarchy.Subtree {
    return {
        nodes: Object.fromEntries(keys.map((key) => [key, entry])),
        pages,
    } as unknown as Hierarchy.Subtree;
}

/** A tracker plus the subtrees it handed to its consumer. */
function tracker(): {
    instance: HierarchyLoadTracker;
    discovered: string[][];
} {
    const discovered: string[][] = [];
    const instance = new HierarchyLoadTracker("source", (found) => {
        discovered.push(Object.keys(found.nodes));
    });
    return { instance, discovered };
}

describe("HierarchyLoadTracker", () => {
    beforeEach(() => {
        load.mockReset();
    });

    it("fetches a page once and remembers it was fetched", async () => {
        load.mockResolvedValue(subtree([FIRST_NODE]));
        const { instance } = tracker();

        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);
        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);

        expect(load).toHaveBeenCalledTimes(1);
    });

    it("lets overlapping callers share one fetch instead of racing", async () => {
        load.mockResolvedValue(subtree([FIRST_NODE]));
        const { instance } = tracker();

        await Promise.all([
            instance.ensureLoaded(ROOT_KEY, ROOT_PAGE),
            instance.ensureLoaded(ROOT_KEY, ROOT_PAGE),
        ]);

        expect(load).toHaveBeenCalledTimes(1);
    });

    it("descends into the sub-pages a page points at", async () => {
        load.mockResolvedValueOnce(
            subtree([FIRST_NODE], { [FIRST_NODE]: CHILD_PAGE }),
        ).mockResolvedValueOnce(subtree([SECOND_NODE]));
        const { instance, discovered } = tracker();

        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);

        expect(load).toHaveBeenCalledTimes(2);
        expect(discovered).toEqual([[FIRST_NODE], [SECOND_NODE]]);
    });

    it("records each sub-page against its own key, ready for a later expansion", async () => {
        load.mockResolvedValueOnce(
            subtree([FIRST_NODE], { [FIRST_NODE]: CHILD_PAGE }),
        ).mockResolvedValueOnce(subtree([SECOND_NODE]));
        const { instance } = tracker();

        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);

        expect(instance.pageByKey.get(FIRST_NODE)).toBe(CHILD_PAGE);
    });

    it("passes on only the nodes its consumer has not seen", async () => {
        load.mockResolvedValueOnce(subtree([FIRST_NODE]));
        load.mockResolvedValueOnce(subtree([FIRST_NODE, SECOND_NODE]));
        const { instance, discovered } = tracker();

        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);
        await instance.ensureLoaded("1-1-1-1", ROOT_PAGE);

        expect(discovered).toEqual([[FIRST_NODE], [SECOND_NODE]]);
    });

    it("stays silent when a page brings nothing new", async () => {
        load.mockResolvedValue(subtree([FIRST_NODE]));
        const { instance, discovered } = tracker();

        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);
        await instance.ensureLoaded("1-1-1-1", ROOT_PAGE);

        expect(discovered).toEqual([[FIRST_NODE]]);
    });

    it("rides over a transient root failure with its built-in retry", async () => {
        load.mockRejectedValueOnce(new Error("network"));
        load.mockResolvedValueOnce(subtree([FIRST_NODE]));
        const { instance, discovered } = tracker();

        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);

        expect(discovered).toEqual([[FIRST_NODE]]);
    });

    it("leaves a persistently failing root unloaded, so the next cycle can try again", async () => {
        load.mockRejectedValue(new Error("network"));
        const { instance } = tracker();

        await expect(
            instance.ensureLoaded(ROOT_KEY, ROOT_PAGE),
        ).rejects.toThrow("network");
        await expect(
            instance.ensureLoaded(ROOT_KEY, ROOT_PAGE),
        ).rejects.toThrow("network");
    });

    it("fetches only the keys it has not already loaded", async () => {
        load.mockResolvedValue(subtree([FIRST_NODE]));
        const { instance } = tracker();
        const pages = new Map([
            [ROOT_KEY, ROOT_PAGE],
            [FIRST_NODE, CHILD_PAGE],
        ]);
        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);

        const fetched = await instance.ensureLoadedMany(
            [ROOT_KEY, FIRST_NODE],
            pages,
        );

        expect(fetched).toBe(1);
    });

    it("passes over a key it has no page for", async () => {
        const { instance } = tracker();

        const fetched = await instance.ensureLoadedMany(
            ["9-9-9-9"],
            new Map([[ROOT_KEY, ROOT_PAGE]]),
        );

        expect(fetched).toBe(0);
        expect(load).not.toHaveBeenCalled();
    });

    it("forgets everything when cleared", async () => {
        load.mockResolvedValue(subtree([FIRST_NODE]));
        const { instance } = tracker();
        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);

        instance.clear();

        expect(instance.pageByKey.size).toBe(0);
        await instance.ensureLoaded(ROOT_KEY, ROOT_PAGE);
        expect(load).toHaveBeenCalledTimes(2);
    });
});
