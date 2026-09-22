import { describe, it, expect, vi, afterEach } from "vitest";
import type maplibregl from "maplibre-gl";
import { MapToolStore } from "./MapToolStore";
import type {
    ActionMapTool,
    InteractiveMapTool,
} from "@core/contracts";
import { MAP_TOOL_KIND } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { logger } from "@core/lib/logger";

type Hooks = {
    /** Plain callback — wrapped into the contract's `(map) => void` shape. */
    onActivate?: () => void;
    onDeactivate?: () => void;
};

function interactiveTool(id: string, hooks: Hooks = {}): InteractiveMapTool {
    return {
        id,
        icon: "",
        kind: MAP_TOOL_KIND.interactive,
        component: () => null,
        localeTranslations: {},
        ...(hooks.onActivate
            ? { onActivate: (): void => hooks.onActivate?.() }
            : {}),
        ...(hooks.onDeactivate
            ? { onDeactivate: (): void => hooks.onDeactivate?.() }
            : {}),
    };
}

function actionTool(id: string): ActionMapTool {
    return {
        id,
        icon: "",
        kind: MAP_TOOL_KIND.action,
        localeTranslations: {},
        execute: vi.fn(),
    };
}

const fakeMap = {} as maplibregl.Map;

/** StoreRegistry stub: only what MapToolStore touches at registration time. */
const createStore = (): MapToolStore =>
    new MapToolStore({
        localeStore: { t: () => ({}) },
        settingsStore: { registerSettings: () => undefined },
    } as unknown as StoreRegistry);

describe("MapToolStore", () => {
    afterEach(() => vi.restoreAllMocks());

    it("activating a second interactive tool deactivates the first", () => {
        const store = createStore();
        const deactivateA = vi.fn();
        const activateB = vi.fn();
        store.registerTool(interactiveTool("a", { onDeactivate: deactivateA }));
        store.registerTool(interactiveTool("b", { onActivate: activateB }));
        store.onMapChanged(fakeMap);

        store.activateTool("a");
        expect(store.activeToolId).toBe("a");

        store.activateTool("b");
        expect(store.activeToolId).toBe("b");
        expect(deactivateA).toHaveBeenCalledTimes(1);
        expect(activateB).toHaveBeenCalledTimes(1);
    });

    it("a failed activation hook leaves the previous tool active", () => {
        vi.spyOn(logger, "error").mockImplementation(() => undefined);
        const store = createStore();
        const activateA = vi.fn();
        const deactivateA = vi.fn();
        const failingActivation = vi.fn(() => {
            throw new Error("boom");
        });
        store.registerTool(interactiveTool("a", {
            onActivate: activateA,
            onDeactivate: deactivateA,
        }));
        store.registerTool(interactiveTool("b", {
            onActivate: failingActivation,
        }));
        store.onMapChanged(fakeMap);

        store.activateTool("a");
        store.activateTool("b");

        expect(store.activeToolId).toBe("a");
        expect(failingActivation).toHaveBeenCalledTimes(1);
        // The previous tool is restored through the full activation path.
        expect(deactivateA).toHaveBeenCalledTimes(1);
        expect(activateA).toHaveBeenCalledTimes(2);
    });

    it("executing an action tool creates no active state", () => {
        const store = createStore();
        const action = actionTool("reset");
        store.registerTool(action);
        store.onMapChanged(fakeMap);

        store.executeTool("reset");

        expect(store.activeToolId).toBeNull();
        expect(action.execute).toHaveBeenCalledWith({
            context: store.rootStore.toolContext,
            map: fakeMap,
        });
    });

    it("executing an action tool never deactivates the active interactive tool", () => {
        const store = createStore();
        store.registerTool(interactiveTool("ruler"));
        store.registerTool(actionTool("reset"));
        store.onMapChanged(fakeMap);
        store.activateTool("ruler");

        store.executeTool("reset");

        expect(store.isToolActive("ruler")).toBe(true);
    });

    it("an action tool cannot be activated", () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(
            () => undefined,
        );
        const store = createStore();
        const action = actionTool("reset");
        store.registerTool(action);
        store.onMapChanged(fakeMap);

        store.activateTool("reset");

        expect(warn).toHaveBeenCalled();
        expect(store.activeToolId).toBeNull();
        expect(action.execute).not.toHaveBeenCalled();
    });

    it("toggling an active tool deactivates it", () => {
        const store = createStore();
        const deactivateRuler = vi.fn();
        store.registerTool(interactiveTool("ruler", {
            onDeactivate: deactivateRuler,
        }));
        store.onMapChanged(fakeMap);

        store.toggleTool("ruler");
        expect(store.isToolActive("ruler")).toBe(true);

        store.toggleTool("ruler");
        expect(store.activeToolId).toBeNull();
        expect(deactivateRuler).toHaveBeenCalledTimes(1);
    });
});

describe("MapToolStore settings auto-registration", () => {
    function createStoreWithSettingsSpy(): {
        store: MapToolStore;
        registerSettings: ReturnType<typeof vi.fn>;
    } {
        const registerSettings = vi.fn();
        const store = new MapToolStore({
            localeStore: { t: () => ({}) },
            settingsStore: { registerSettings },
        } as unknown as StoreRegistry);
        return { store, registerSettings };
    }

    it("registers a tool's settings in one batch under the tool's id", () => {
        const { store, registerSettings } = createStoreWithSettingsSpy();
        const settings = [
            { id: "s", label: "s", type: "boolean", defaultValue: false },
        ];

        const tool = {
            ...interactiveTool("measure"),
            settings,
        } as InteractiveMapTool;
        store.registerTool(tool);

        // The locale carries no "tool.name", so the id doubles as the display name.
        expect(registerSettings).toHaveBeenCalledWith("measure", "measure", settings);
    });

    it("a tool without settings still lands as an empty batch", () => {
        const { store, registerSettings } = createStoreWithSettingsSpy();

        store.registerTool(interactiveTool("ruler"));

        expect(registerSettings).toHaveBeenCalledWith(
            "ruler",
            "ruler",
            [],
        );
    });
});
