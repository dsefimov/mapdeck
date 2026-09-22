import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAutoObservable, runInAction } from "mobx";
import { logger } from "@core/lib/logger";
import { LayerManager, type LayerManagerDeps } from "./LayerManager";
import type {
    LayerAdapter,
    MapContext,
    RenderUnit,
    SnapshotItem,
} from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";

function fakeMap() {
    return {
        loaded: () => true,
        on: vi.fn(),
        off: vi.fn(),
        getLayer: () => undefined,
        moveLayer: vi.fn(),
    } as unknown as MapContext["map"];
}

function createAdapter(): {
    adapter: LayerAdapter;
    addToMap: ReturnType<typeof vi.fn>;
} {
    const addToMap = vi.fn();
    const adapter = {
        nativeLayerOrdering: false,
        addToMap,
        removeFromMap: vi.fn(),
        updateVisibility: vi.fn(),
        updateConfig: vi.fn(),
    } as unknown as LayerAdapter;
    return { adapter, addToMap };
}

function snapshotItem(
    id: string,
    visible: boolean,
    config: Record<string, unknown> = {},
): SnapshotItem {
    return {
        id,
        visible,
        protocolId: "test",
        descriptor: { sourceUrl: `https://example.com/${id}`, config },
    };
}

interface Harness {
    manager: LayerManager;
    treeStore: {
        layerSnapshot: SnapshotItem[];
        reportRenderError: ReturnType<typeof vi.fn>;
    };
    adapter: LayerAdapter;
    addToMap: ReturnType<typeof vi.fn>;
}

const managers: LayerManager[] = [];

function createHarness(options?: { groupAll?: boolean }): Harness {
    const { adapter, addToMap } = createAdapter();

    const treeStore = makeAutoObservable(
        {
            layerSnapshot: [] as SnapshotItem[],
            reportRenderError: vi.fn(),
        },
        { reportRenderError: false },
    );

    const groupAll = options?.groupAll
        ? (units: Map<string, unknown>): void => {
              if (units.size === 0) return;
              const merged = [...units.values()] as RenderUnit[];
              const group: RenderUnit = {
                  id: "grp",
                  nodeIds: merged.flatMap((u) => u.nodeIds),
                  protocolId: "test",
                  adapter,
                  descriptor: {
                      sourceUrl: "https://example.com/grp",
                      config: {},
                  },
              };
              units.clear();
              units.set(group.id, group);
          }
        : undefined;

    const protocol = {
        getLayerAdapter: () => adapter,
        groupRenderUnits: groupAll,
    };
    const protocolRegistry = {
        getById: () => protocol,
        getAll: () => [protocol],
    } as unknown as StoreRegistry["protocolRegistry"];

    const ctx = {
        map: fakeMap(),
        overlayManager: {
            addLayer: vi.fn(),
            removeLayer: vi.fn(),
            updateLayer: vi.fn(),
            setLayerVisibility: vi.fn(),
        },
    } as unknown as MapContext;

    const manager = new LayerManager(
        {
            snapshot: treeStore,
            errors: treeStore,
            protocols: protocolRegistry,
        } as unknown as LayerManagerDeps,
        ctx,
    );
    managers.push(manager);
    manager.initialize();

    return {
        manager,
        treeStore: treeStore as Harness["treeStore"],
        adapter,
        addToMap,
    };
}

function setSnapshot(
    treeStore: Harness["treeStore"],
    items: SnapshotItem[],
): void {
    runInAction(() => {
        treeStore.layerSnapshot = items;
    });
}

describe("LayerManager render-unit reconciliation", () => {
    beforeEach(() => {
        managers.length = 0;
    });

    afterEach(() => {
        for (const manager of managers) {
            manager.dispose();
        }
        managers.length = 0;
    });

    it("unregisters a failed unit and surfaces the per-node error", () => {
        const { manager, treeStore, addToMap } = createHarness();
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        expect(addToMap).toHaveBeenCalledTimes(1);

        manager.handleLayerError("A", new Error("boom"));

        expect(treeStore.reportRenderError).toHaveBeenCalledWith(["A"], "boom");

        // A subsequent sync with unchanged node state does NOT retry.
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        expect(addToMap).toHaveBeenCalledTimes(1);
    });

    it("re-adds a failed unit after a visibility toggle", () => {
        const { manager, treeStore, addToMap } = createHarness();
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        expect(addToMap).toHaveBeenCalledTimes(1);

        manager.handleLayerError("A", new Error("boom"));

        setSnapshot(treeStore, [snapshotItem("A", false)]);
        setSnapshot(treeStore, [snapshotItem("A", true)]);

        expect(addToMap).toHaveBeenCalledTimes(2);
        expect(addToMap).toHaveBeenLastCalledWith(
            "A",
            expect.anything(),
            expect.anything(),
        );
    });

    it("re-adds a failed unit after a config change", () => {
        const { manager, treeStore, addToMap } = createHarness();
        setSnapshot(treeStore, [snapshotItem("A", true, { pointSize: 2 })]);
        expect(addToMap).toHaveBeenCalledTimes(1);

        manager.handleLayerError("A", new Error("boom"));

        setSnapshot(treeStore, [snapshotItem("A", true, { pointSize: 3 })]);

        expect(addToMap).toHaveBeenCalledTimes(2);
    });

    it("does not retry a failed unit on an unrelated tree change", () => {
        const { manager, treeStore, addToMap } = createHarness();
        setSnapshot(treeStore, [
            snapshotItem("A", true),
            snapshotItem("B", true),
        ]);
        expect(addToMap).toHaveBeenCalledTimes(2);

        manager.handleLayerError("A", new Error("boom"));

        setSnapshot(treeStore, [
            snapshotItem("A", true),
            snapshotItem("B", false),
        ]);

        expect(addToMap).toHaveBeenCalledTimes(2);
    });

    it("logs only when a report arrives for a removed unit", () => {
        const { manager, treeStore, adapter } = createHarness();
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        manager.handleLayerError("A", new Error("boom"));

        // A is removed from the tree entirely — the failure record and its
        // per-node error are cleared by the sync.
        setSnapshot(treeStore, []);

        const reportSpy = treeStore.reportRenderError;
        const callsBefore = reportSpy.mock.calls.length;

        // A late report for the removed unit must log only and mutate nothing.
        manager.handleLayerError("A", new Error("late boom"));

        expect(reportSpy.mock.calls.length).toBe(callsBefore);
        expect(reportSpy).toHaveBeenLastCalledWith(["A"], null);
        expect(adapter.removeFromMap).not.toHaveBeenCalledWith(
            "A",
            expect.anything(),
        );
    });

    it("clears the per-node error when a failed unit is re-added successfully", () => {
        const { manager, treeStore } = createHarness();
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        manager.handleLayerError("A", new Error("boom"));

        setSnapshot(treeStore, [snapshotItem("A", false)]);
        setSnapshot(treeStore, [snapshotItem("A", true)]);

        expect(treeStore.reportRenderError).toHaveBeenLastCalledWith(
            ["A"],
            null,
        );
    });

    it("clears the per-node error when the failed node leaves the tree", () => {
        const { manager, treeStore } = createHarness();
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        manager.handleLayerError("A", new Error("boom"));

        setSnapshot(treeStore, []);

        expect(treeStore.reportRenderError).toHaveBeenLastCalledWith(
            ["A"],
            null,
        );
    });

    it("a failed group unit retries only after every node was hidden at a refresh", () => {
        const { manager, treeStore, addToMap } = createHarness({
            groupAll: true,
        });
        setSnapshot(treeStore, [
            snapshotItem("A", true),
            snapshotItem("B", true),
        ]);
        expect(addToMap).toHaveBeenCalledTimes(1);

        manager.handleLayerError("grp", new Error("boom"));

        // Partially hidden: the record's every-node visibility is not met yet.
        setSnapshot(treeStore, [snapshotItem("A", false), snapshotItem("B", true)]);
        expect(addToMap).toHaveBeenCalledTimes(1);

        // The same unchanged snapshot re-syncs — the refreshed record now
        // counts the group as hidden, so the retry fires.
        setSnapshot(treeStore, [snapshotItem("A", false), snapshotItem("B", true)]);
        expect(addToMap).toHaveBeenCalledTimes(2);
    });

    it("a failed group keeps its error until every node has left the tree", () => {
        const { manager, treeStore } = createHarness({ groupAll: true });
        setSnapshot(treeStore, [
            snapshotItem("A", true),
            snapshotItem("B", true),
        ]);
        manager.handleLayerError("grp", new Error("boom"));
        const nullCalls = (): number =>
            treeStore.reportRenderError.mock.calls.filter(
                (call) => call[1] === null,
            ).length;
        const nullsBefore = nullCalls();

        // B leaves; A remains — the record (and A's error) stays.
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        expect(nullCalls()).toBe(nullsBefore);

        // The last node leaves — the record and its errors are dropped.
        setSnapshot(treeStore, []);
        expect(treeStore.reportRenderError).toHaveBeenLastCalledWith(
            ["A", "B"],
            null,
        );
    });
});

describe("LayerManager failure channels", () => {
    beforeEach(() => {
        managers.length = 0;
    });

    afterEach(() => {
        for (const manager of managers) {
            manager.dispose();
        }
        managers.length = 0;
        vi.restoreAllMocks();
    });

    it("records a synchronously throwing add as a gated failure, not a unit", () => {
        const { treeStore, addToMap } = createHarness();
        const ADD_FAILURE = "add failed";
        addToMap.mockImplementation(() => {
            throw new Error(ADD_FAILURE);
        });

        setSnapshot(treeStore, [snapshotItem("A", true)]);

        expect(treeStore.reportRenderError).toHaveBeenCalledWith(
            ["A"],
            ADD_FAILURE,
        );

        // The unit never registered: an unchanged sync does not retry it.
        const attempts = 1;
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        expect(addToMap).toHaveBeenCalledTimes(attempts);
    });

    it("retries a sync-thrown add after the node toggles visibility", () => {
        const { treeStore, addToMap } = createHarness();
        addToMap.mockImplementationOnce(() => {
            throw new Error("add failed");
        });
        setSnapshot(treeStore, [snapshotItem("A", true)]);
        expect(addToMap).toHaveBeenCalledTimes(1);

        setSnapshot(treeStore, [snapshotItem("A", false)]);
        setSnapshot(treeStore, [snapshotItem("A", true)]);

        expect(addToMap).toHaveBeenCalledTimes(2);
    });

    it("keeps the previous descriptor when an update throws, retrying on every sync", () => {
        vi.spyOn(logger, "error").mockImplementation(() => {});
        const { treeStore, adapter } = createHarness();
        setSnapshot(treeStore, [snapshotItem("A", true, { pointSize: 2 })]);

        adapter.updateConfig = vi.fn(() => {
            throw new Error("update failed");
        });

        // Two identical snapshots after the change — the unit kept its old
        // descriptor, so each sync still classifies the change as an update.
        setSnapshot(treeStore, [snapshotItem("A", true, { pointSize: 3 })]);
        setSnapshot(treeStore, [snapshotItem("A", true, { pointSize: 3 })]);

        expect(adapter.updateConfig).toHaveBeenCalledTimes(2);
        // Update failures reach the tree like add failures do — the node
        // shows its render error instead of silently diverging from the map.
        expect(treeStore.reportRenderError).toHaveBeenCalledWith(
            ["A"],
            "update failed",
        );
    });

    it("adds nothing before the map fires load, then syncs the backlog", () => {
        const loadHandlers: (() => void)[] = [];
        const map = {
            loaded: () => false,
            on: (event: string, handler: () => void) => {
                if (event === "load") loadHandlers.push(handler);
            },
            off: vi.fn(),
            getLayer: () => undefined,
            moveLayer: vi.fn(),
        } as unknown as MapContext["map"];

        const { adapter, addToMap } = createAdapter();
        const treeStore = makeAutoObservable(
            {
                layerSnapshot: [] as SnapshotItem[],
                reportRenderError: vi.fn(),
            },
            { reportRenderError: false },
        );
        const protocol = { getLayerAdapter: () => adapter };
        const manager = new LayerManager(
            {
                snapshot: treeStore,
                errors: treeStore,
                protocols: {
                    getById: () => protocol,
                    getAll: () => [protocol],
                } as unknown as LayerManagerDeps["protocols"],
            } as unknown as LayerManagerDeps,
            { map } as unknown as MapContext,
        );
        managers.push(manager);
        manager.initialize();

        setSnapshot(treeStore as Harness["treeStore"], [
            snapshotItem("A", true),
        ]);
        expect(addToMap).not.toHaveBeenCalled();

        for (const handler of loadHandlers) handler();

        expect(addToMap).toHaveBeenCalledTimes(1);
    });
});

describe("LayerManager native layer reorder", () => {
    beforeEach(() => {
        managers.length = 0;
    });

    afterEach(() => {
        for (const manager of managers) {
            manager.dispose();
        }
        managers.length = 0;
    });

    it("a missing beforeId is skipped without aborting the remaining moves", () => {
        const addToMap = vi.fn();
        const adapter = {
            nativeLayerOrdering: true,
            addToMap,
            removeFromMap: vi.fn(),
            updateVisibility: vi.fn(),
            updateConfig: vi.fn(),
        } as unknown as LayerAdapter;

        const treeStore = makeAutoObservable(
            {
                layerSnapshot: [] as SnapshotItem[],
                reportRenderError: vi.fn(),
            },
            { reportRenderError: false },
        );

        const protocol = { getLayerAdapter: () => adapter };
        const map = {
            loaded: () => true,
            on: vi.fn(),
            off: vi.fn(),
            // "A" never lands in the style — a race or a failed add.
            getLayer: (id: string) =>
                id === "A" ? undefined : ({} as never),
            moveLayer: vi.fn(),
        } as unknown as MapContext["map"];

        const manager = new LayerManager(
            {
                snapshot: treeStore,
                errors: treeStore,
                protocols: {
                    getById: () => protocol,
                    getAll: () => [protocol],
                } as unknown as LayerManagerDeps["protocols"],
            } as unknown as LayerManagerDeps,
            { map } as unknown as MapContext,
        );
        managers.push(manager);
        manager.initialize();

        // Snapshot order A, ghost, C with A absent from the style:
        // move(ghost, A) is skipped — maplibre would throw on the missing
        // neighbor and abort every later move — but move(C, ghost) still runs.
        setSnapshot(treeStore as Harness["treeStore"], [
            snapshotItem("A", true),
            snapshotItem("ghost", true),
            snapshotItem("C", true),
        ]);

        expect(addToMap).toHaveBeenCalledTimes(3);
        expect(map.moveLayer).not.toHaveBeenCalledWith("ghost", "A");
        expect(map.moveLayer).toHaveBeenCalledWith("C", "ghost");
    });
});
