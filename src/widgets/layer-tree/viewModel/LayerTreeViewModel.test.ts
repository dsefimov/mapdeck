import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerTreeViewModel } from "./LayerTreeViewModel";
import {
    isGroupNode,
    LayerTreeNodeTypes,
    type GroupNode,
    type LayerNode,
    type ProtocolBinding,
    type TreeNode,
} from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";

// Local fixtures — the domain's __testFactories stay inside its own tests.
function protocolBinding(
    overrides?: Partial<ProtocolBinding>,
): ProtocolBinding {
    return {
        protocolId: "wms",
        sourceUrl: "https://example.com/wms",
        params: {},
        ...overrides,
    };
}

function layerNode(
    id: string,
    overrides?: Partial<Omit<LayerNode, "id" | "type">>,
): LayerNode {
    return {
        id,
        type: LayerTreeNodeTypes.Layer,
        title: id,
        description: "",
        parentId: null,
        bbox: null,
        isVisible: true,
        renderer: protocolBinding(),
        capabilities: [],
        style: {},
        relatedObjects: [],
        ...overrides,
    };
}

function groupNode(
    id: string,
    childrenIds: string[],
    overrides?: Partial<Omit<GroupNode, "id" | "type" | "childrenIds">>,
): GroupNode {
    return {
        id,
        type: LayerTreeNodeTypes.Group,
        title: id,
        description: "",
        parentId: null,
        bbox: null,
        isVisible: true,
        childrenIds,
        childrenCount: childrenIds.length,
        relatedObjects: [],
        ...overrides,
    } as GroupNode;
}

function wireParents(nodes: Record<string, TreeNode>): void {
    for (const node of Object.values(nodes)) {
        if (isGroupNode(node)) {
            for (const childId of node.childrenIds) {
                const child = nodes[childId];
                if (child) child.parentId = node.id;
            }
        }
    }
}

function createVm(
    nodes: Record<string, TreeNode>,
    ensureChildrenLoaded = vi.fn(async () => {}),
    refresh = vi.fn(async () => {}),
): {
    vm: LayerTreeViewModel;
    ensureChildrenLoaded: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
} {
    wireParents(nodes);
    const treeStore = {
        treeState: {
            getNode: (id: string) => nodes[id],
            childrenOf: (parentId: string) => {
                const node = nodes[parentId];
                return node && isGroupNode(node) ? node.childrenIds : [];
            },
            rootIds: [] as string[],
        },
        rootNodes: Object.values(nodes).filter((n) => n.parentId === null),
        node: (id: string) => nodes[id],
        childrenOf: (parentId: string) => {
            const node = nodes[parentId];
            if (!node || !isGroupNode(node)) return [];
            return node.childrenIds
                .map((id) => nodes[id])
                .filter((child): child is TreeNode => child !== undefined);
        },
        ensureChildrenLoaded,
        refresh,
    };
    const vm = new LayerTreeViewModel({
        treeStore,
    } as unknown as StoreRegistry);
    return { vm, ensureChildrenLoaded, refresh };
}

describe("visibleRows", () => {
    it("lists root nodes at depth 0 without a search", () => {
        const { vm } = createVm({
            A: groupNode("A", []),
            B: layerNode("B"),
        });
        expect(vm.visibleRows).toEqual([
            { nodeId: "A", depth: 0 },
            { nodeId: "B", depth: 0 },
        ]);
    });

    it("shows children of expanded groups at depth+1", () => {
        const { vm } = createVm({
            A: groupNode("A", ["A1", "A2"]),
            A1: layerNode("A1"),
            A2: layerNode("A2"),
        });
        vm.toggleExpanded("A");
        expect(vm.visibleRows).toEqual([
            { nodeId: "A", depth: 0 },
            { nodeId: "A1", depth: 1 },
            { nodeId: "A2", depth: 1 },
        ]);
    });

    it("hides children of collapsed groups", () => {
        const { vm } = createVm({
            A: groupNode("A", ["A1"]),
            A1: layerNode("A1"),
        });
        expect(vm.visibleRows).toEqual([{ nodeId: "A", depth: 0 }]);
    });

    it("shows a deep match with its ancestors during an active search", async () => {
        vi.useFakeTimers();
        const { vm } = createVm({
            A: groupNode("A", ["B"]),
            B: groupNode("B", ["C"]),
            C: layerNode("C", { title: "Orthophoto" }),
        });
        vm.setSearchQuery("ortho");
        await vi.advanceTimersByTimeAsync(300);
        vi.useRealTimers();
        expect(vm.visibleRows).toEqual([
            { nodeId: "A", depth: 0 },
            { nodeId: "B", depth: 1 },
            { nodeId: "C", depth: 2 },
        ]);
    });

    it("excludes non-matching branches during search", async () => {
        vi.useFakeTimers();
        const { vm } = createVm({
            A: groupNode("A", ["B", "X"]),
            B: groupNode("B", ["C"]),
            C: layerNode("C", { title: "Orthophoto" }),
            X: layerNode("X", { title: "Other" }),
        });
        vm.setSearchQuery("ortho");
        await vi.advanceTimersByTimeAsync(300);
        vi.useRealTimers();
        expect(vm.visibleRows).toEqual([
            { nodeId: "A", depth: 0 },
            { nodeId: "B", depth: 1 },
            { nodeId: "C", depth: 2 },
        ]);
    });

    it("returns an empty list for an empty tree", () => {
        const { vm } = createVm({});
        expect(vm.visibleRows).toEqual([]);
    });

    it("produces no row for a stale id", () => {
        const { vm } = createVm({ A: layerNode("A") });
        vm.expandedIds.add("GONE");
        expect(vm.visibleRows).toEqual([{ nodeId: "A", depth: 0 }]);
    });
});

describe("toggleExpanded", () => {
    it("expands a loaded group without loading", () => {
        const { vm, ensureChildrenLoaded } = createVm({
            A: groupNode("A", ["A1"]),
            A1: layerNode("A1"),
        });
        vm.toggleExpanded("A");
        expect(vm.expandedIds.has("A")).toBe(true);
        expect(ensureChildrenLoaded).not.toHaveBeenCalled();
    });

    it("collapses an expanded group", () => {
        const { vm } = createVm({
            A: groupNode("A", ["A1"]),
            A1: layerNode("A1"),
        });
        vm.toggleExpanded("A");
        vm.toggleExpanded("A");
        expect(vm.expandedIds.has("A")).toBe(false);
    });

    it("loads children when expanding an unloaded group", () => {
        const { vm, ensureChildrenLoaded } = createVm({
            A: groupNode("A", []),
        });
        vm.toggleExpanded("A");
        expect(vm.expandedIds.has("A")).toBe(true);
        expect(ensureChildrenLoaded).toHaveBeenCalledWith(
            "A",
            expect.any(AbortSignal),
        );
    });

    it("rolls the expansion back when the load fails", async () => {
        const { vm } = createVm(
            { A: groupNode("A", []) },
            vi.fn(async () => {
                throw new Error("load failed");
            }),
        );
        vm.toggleExpanded("A");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(vm.expandedIds.has("A")).toBe(false);
    });

    it("ignores an unknown node id", () => {
        const { vm, ensureChildrenLoaded } = createVm({ A: layerNode("A") });
        vm.toggleExpanded("missing");
        expect(vm.expandedIds.size).toBe(0);
        expect(ensureChildrenLoaded).not.toHaveBeenCalled();
    });
});

describe("refreshTree", () => {
    it("reloads children of every expanded group after the store refresh", async () => {
        const { vm, refresh, ensureChildrenLoaded } = createVm({
            A: groupNode("A", ["A1"]),
            A1: layerNode("A1"),
            B: groupNode("B", []),
            C: groupNode("C", ["C1"]),
            C1: layerNode("C1"),
        });
        vm.toggleExpanded("A");
        vm.toggleExpanded("B");

        await vm.refreshTree();

        expect(refresh).toHaveBeenCalledWith(undefined, undefined);
        const reloaded = ensureChildrenLoaded.mock.calls.map(
            (call) => call[0],
        );
        expect(reloaded).toContain("A");
        expect(reloaded).toContain("B");
        expect(reloaded).not.toContain("C");
    });

    it("reloads expanded groups level by level, deepest after their parents", async () => {
        const nodes: Record<string, TreeNode> = {
            A: groupNode("A", ["B"]),
            B: groupNode("B", ["C"]),
            C: groupNode("C", ["C1"]),
            C1: layerNode("C1"),
        };
        wireParents(nodes);
        const treeStore = {
            treeState: {
                getNode: (id: string) => nodes[id],
                childrenOf: (parentId: string) => {
                    const node = nodes[parentId];
                    return node && isGroupNode(node) ? node.childrenIds : [];
                },
                rootIds: [] as string[],
            },
            rootNodes: [nodes["A"]!],
            node: (id: string) => nodes[id],
            childrenOf: (parentId: string) => {
                const node = nodes[parentId];
                return node && isGroupNode(node)
                    ? node.childrenIds.map((id) => nodes[id]!)
                    : [];
            },
            ensureChildrenLoaded: vi.fn(async (id: string) => {
                // The store rebuilds the group on load — the child group
                // only becomes addressable through childrenOf afterwards.
                if (id === "A") nodes["A"] = { ...nodes["A"]! };
            }),
            refresh: vi.fn(async () => {}),
        };
        const vm = new LayerTreeViewModel({
            treeStore,
        } as unknown as StoreRegistry);
        vm.toggleExpanded("A");
        vm.toggleExpanded("B");
        vm.toggleExpanded("C");

        await vm.refreshTree();

        const order = (treeStore.ensureChildrenLoaded as ReturnType<
            typeof vi.fn
        >).mock.calls.map((call) => call[0]);
        expect(order).toEqual(["A", "B", "C"]);
    });

    it("skips the reload when the refresh was aborted", async () => {
        const { vm, ensureChildrenLoaded } = createVm({
            A: groupNode("A", ["A1"]),
            A1: layerNode("A1"),
        });
        vm.toggleExpanded("A");
        const controller = new AbortController();
        controller.abort();

        await vm.refreshTree(controller.signal);

        expect(ensureChildrenLoaded).not.toHaveBeenCalled();
    });
});

describe("menu state", () => {
    it("opens a menu", () => {
        const { vm } = createVm({ A: layerNode("A") });
        vm.openMenu("A");
        expect(vm.openMenuId).toBe("A");
    });

    it("replaces the open menu when another node is opened", () => {
        const { vm } = createVm({ A: layerNode("A"), B: layerNode("B") });
        vm.openMenu("A");
        vm.openMenu("B");
        expect(vm.openMenuId).toBe("B");
    });

    it("toggles off when the same node is opened again", () => {
        const { vm } = createVm({ A: layerNode("A") });
        vm.openMenu("A");
        vm.openMenu("A");
        expect(vm.openMenuId).toBeNull();
    });

    it("closes explicitly", () => {
        const { vm } = createVm({ A: layerNode("A") });
        vm.openMenu("A");
        vm.closeMenu();
        expect(vm.openMenuId).toBeNull();
    });
});

describe("search", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("clears the search immediately for an empty query", () => {
        const { vm, ensureChildrenLoaded } = createVm({
            A: layerNode("A", { title: "Orthophoto" }),
        });
        vm.setSearchQuery("ortho");
        vm.setSearchQuery("");
        expect(vm.searchQuery).toBe("");
        expect(vm.matchedIds.size).toBe(0);
        vi.advanceTimersByTime(400);
        expect(ensureChildrenLoaded).not.toHaveBeenCalled();
    });

    it("treats a whitespace-only query as empty and trims it", () => {
        const { vm } = createVm({ A: layerNode("A") });
        vm.setSearchQuery("   ");
        expect(vm.searchQuery).toBe("");
    });

    it("runs exactly one debounced search with the final query", async () => {
        const { vm, ensureChildrenLoaded } = createVm({
            A: groupNode("A", ["L"]),
            L: layerNode("L", { title: "Orthophoto" }),
        });
        vm.setSearchQuery("o");
        vm.setSearchQuery("or");
        vm.setSearchQuery("ort");
        expect(vm.searchQuery).toBe("ort");
        await vi.advanceTimersByTimeAsync(300);
        expect(vm.matchedIds.has("L")).toBe(true);
        expect(ensureChildrenLoaded).toHaveBeenCalled();
    });

    it("aborts a superseded run without applying its results", async () => {
        const { vm } = createVm({
            A: groupNode("A", ["L1"]),
            L1: layerNode("L1", { title: "Orthophoto" }),
            L2: layerNode("L2", { title: "Elevation" }),
        });
        vm.setSearchQuery("ortho");
        // Second query supersedes the first before it fires.
        vm.setSearchQuery("elevation");
        await vi.advanceTimersByTimeAsync(300);
        expect(vm.matchedIds.has("L1")).toBe(false);
        expect(vm.matchedIds.has("L2")).toBe(true);
    });

    it("clears matches when the search fails", async () => {
        const { vm } = createVm(
            {
                A: groupNode("A", ["L"]),
                L: layerNode("L", { title: "Orthophoto" }),
            },
            vi.fn(async () => {
                throw new Error("load failed");
            }),
        );
        vm.setSearchQuery("ortho");
        await vi.advanceTimersByTimeAsync(300);
        expect(vm.matchedIds.size).toBe(0);
    });

    it("does not invoke loadChildren for an empty tree", async () => {
        const { vm, ensureChildrenLoaded } = createVm({});
        vm.setSearchQuery("ortho");
        await vi.advanceTimersByTimeAsync(300);
        expect(vm.matchedIds.size).toBe(0);
        expect(ensureChildrenLoaded).not.toHaveBeenCalled();
    });

    it("keeps the tree visible while a search is pending", () => {
        const { vm } = createVm({
            A: groupNode("A", ["A1"]),
            A1: layerNode("A1", { title: "Orthophoto" }),
        });
        vm.setSearchQuery("ortho");
        // Before the debounced run fires there are no results yet — expansion
        // rows stay visible instead of flashing an empty tree.
        expect(vm.visibleRows).toEqual([{ nodeId: "A", depth: 0 }]);
    });
});
