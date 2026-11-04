// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StoreProvider } from "@core/shell";
import { LocaleStore } from "@core/common/locale/LocaleStore";
import { StateStore } from "@core/lib/state/StateStore";
import { Bbox } from "@core/lib/geo";
import {
    LayerTreeNodeTypes,
    type LayerNode,
    type LayerStyle,
    type PointCloudData,
    type ProtocolRegistry,
} from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { pointClassificationFilterTranslations } from "../locale";
import {
    POINT_CLASSIFICATION_FILTER_ID,
    registerPointClassificationFilterTool,
} from "./Tool";
import { PointClassificationFilterComponent } from "./Panel";

afterEach(cleanup);

const NODE_ID = "layer-1";

/** A layer node whose style the test observes being written. */
function layerNode(style: LayerStyle): LayerNode {
    return {
        id: NODE_ID,
        type: LayerTreeNodeTypes.Layer,
        title: "Cloud",
        style,
    } as LayerNode;
}

function cloudData(codes: number[]): PointCloudData {
    return {
        positions: new Float32Array(codes.length * 3),
        coordinateOrigin: [0, 0, 0],
        pointCount: codes.length,
        colors: new Uint8Array(codes.length * 4),
        classifications: Uint8Array.from(codes),
        bounds: Bbox.fromCorners({
            minX: 0,
            minY: 0,
            minZ: 0,
            maxX: 1,
            maxY: 1,
            maxZ: 1,
        }),
    };
}

/**
 * A registry whose single protocol serves the given envelopes — enough
 * surface for the capability lookup the panel runs on every render.
 */
function registryServing(
    data: PointCloudData | undefined,
): ProtocolRegistry {
    const adapter = {
        getLoadedData: (layerId: string) =>
            layerId === NODE_ID ? data : undefined,
        getAllLoadedData: () => (data ? [data] : []),
    };
    return {
        getAll: () => [{ getLayerAdapter: () => adapter }],
    } as unknown as ProtocolRegistry;
}

function renderPanel(
    style: LayerStyle,
    data?: PointCloudData,
): ReturnType<typeof vi.fn> {
    const node = layerNode(style);
    const updateLayerStyle = vi.fn();
    const localeStore = new LocaleStore();
    localeStore.registerTranslations(
        POINT_CLASSIFICATION_FILTER_ID,
        pointClassificationFilterTranslations,
    );

    render(
        <StoreProvider
            store={
                {
                    localeStore,
                    treeStore: { node: () => node, updateLayerStyle },
                    stateStore: new StateStore(),
                    protocolRegistry: registryServing(data),
                } as unknown as StoreRegistry
            }
        >
            <PointClassificationFilterComponent nodeId={NODE_ID} />
        </StoreProvider>,
    );
    return updateLayerStyle;
}

describe("PointClassificationFilter panel", () => {
    it("registers under the copc renderer slot", () => {
        const layerToolStore = {
            registerTool: vi.fn(),
            bindToolToProtocol: vi.fn(),
        };
        registerPointClassificationFilterTool({
            layerToolStore,
        } as unknown as StoreRegistry);

        expect(layerToolStore.registerTool).toHaveBeenCalledWith(
            expect.objectContaining({ id: POINT_CLASSIFICATION_FILTER_ID }),
        );
        expect(layerToolStore.bindToolToProtocol).toHaveBeenCalledWith(
            "copc",
            "renderer",
            POINT_CLASSIFICATION_FILTER_ID,
        );
    });

    it("lists the classes present in the loaded cloud, checked", () => {
        renderPanel({}, cloudData([2, 6]));

        expect(screen.getByLabelText("Ground")).toBeChecked();
        expect(screen.getByLabelText("Building")).toBeChecked();
    });

    it("labels codes outside the LAS table with the raw code", () => {
        renderPanel({}, cloudData([2, 63]));

        expect(screen.getByLabelText("Class 63")).toBeInTheDocument();
    });

    it("shows a placeholder while no classification data is loaded", () => {
        renderPanel({});

        expect(
            screen.getByText("No classification data loaded yet"),
        ).toBeInTheDocument();
    });

    it("unchecking a class writes the code into the style metadata", () => {
        const updateLayerStyle = renderPanel({}, cloudData([2, 6]));

        fireEvent.click(screen.getByLabelText("Ground"));

        expect(updateLayerStyle).toHaveBeenCalledWith(
            NODE_ID,
            expect.objectContaining({
                metadata: expect.objectContaining({
                    hiddenClassifications: [2],
                }),
            }),
        );
    });

    it("checking a hidden class removes its code, keeping the others", () => {
        const updateLayerStyle = renderPanel(
            { metadata: { hiddenClassifications: [2, 6] } },
            cloudData([2, 6]),
        );

        const ground = screen.getByLabelText("Ground");
        expect(ground).not.toBeChecked();

        fireEvent.click(ground);

        expect(updateLayerStyle).toHaveBeenCalledWith(
            NODE_ID,
            expect.objectContaining({
                metadata: expect.objectContaining({
                    hiddenClassifications: [6],
                }),
            }),
        );
    });

    it("keeps classes recorded as hidden listed even when the packed data dropped them", () => {
        // The packed envelope no longer carries class 6 — the style alone
        // must keep the row alive, or the user could never bring it back.
        renderPanel({ metadata: { hiddenClassifications: [6] } }, cloudData([2]));

        expect(screen.getByLabelText("Building")).not.toBeChecked();
        expect(screen.getByLabelText("Ground")).toBeChecked();
    });

    it("ignores garbage in the style metadata — anything unreadable is nothing hidden", () => {
        renderPanel(
            { metadata: { hiddenClassifications: "2" } },
            cloudData([2]),
        );

        expect(screen.getByLabelText("Ground")).toBeChecked();
    });

    it("picks up classes that stream in after the panel opened", () => {
        vi.useFakeTimers();
        try {
            // The panel mounts before any points arrive — the streamed
            // cloud is not observable, so only the poll can re-read it.
            let data: PointCloudData | undefined;
            const adapter = {
                getLoadedData: (layerId: string) =>
                    layerId === NODE_ID ? data : undefined,
                getAllLoadedData: () => [],
            };
            const registry = {
                getAll: () => [{ getLayerAdapter: () => adapter }],
            } as unknown as ProtocolRegistry;
            const node = layerNode({});
            const updateLayerStyle = vi.fn();
            const localeStore = new LocaleStore();
            localeStore.registerTranslations(
                POINT_CLASSIFICATION_FILTER_ID,
                pointClassificationFilterTranslations,
            );
            render(
                <StoreProvider
                    store={
                        {
                            localeStore,
                            treeStore: {
                                node: () => node,
                                updateLayerStyle,
                            },
                            stateStore: new StateStore(),
                            protocolRegistry: registry,
                        } as unknown as StoreRegistry
                    }
                >
                    <PointClassificationFilterComponent nodeId={NODE_ID} />
                </StoreProvider>,
            );
            expect(
                screen.getByText("No classification data loaded yet"),
            ).toBeInTheDocument();

            data = cloudData([2]);
            act(() => {
                vi.advanceTimersByTime(1000);
            });
            expect(screen.getByLabelText("Ground")).toBeChecked();
            expect(
                screen.queryByLabelText("Building"),
            ).not.toBeInTheDocument();

            // A rare class arrives with a later LOD level — the slowed
            // poll still catches it without any user interaction.
            data = cloudData([2, 6]);
            act(() => {
                vi.advanceTimersByTime(3000);
            });
            expect(screen.getByLabelText("Building")).toBeChecked();
        } finally {
            vi.useRealTimers();
        }
    });
});
