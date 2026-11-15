// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { StoreProvider } from "@core/shell";
import type { StoreRegistry } from "@core/store-registry";
import type { CommonRegistry } from "@core/common/common-registry";
import { AttributeValueStore } from "@core/common/attribute-value";
import { AlbumValueView } from "@core/ui/composites";
import MediaViewerComponent from "./Widget";

afterEach(cleanup);

const DICT: Record<string, string> = {
    "mediaValue.photo": "Photo",
    "mediaValue.album": "Album",
    "mediaValue.photoCount": "{count} photos",
    "mediaValue.expand": "Expand to view",
    "mediaValue.loadError": "Failed to load the image",
};

const album = (title: string, titles: string[]) => ({
    kind: "album",
    title,
    photos: titles.map((title) => ({
        kind: "photo",
        url: `/photos/${title}.png`,
        title,
    })),
});

function renderViewer() {
    const attributeValueStore = new AttributeValueStore({
        widgetStore: {
            openWidget: vi.fn(),
            closeWidget: vi.fn(),
            isWidgetOpen: () => true,
        },
        localeStore: { t: () => DICT },
    } as unknown as CommonRegistry);
    attributeValueStore.register({
        id: "album",
        matches: (value) =>
            typeof value === "object" &&
            value !== null &&
            (value as Record<string, unknown>).kind === "album",
        renderCell: () => null,
        renderViewer: (value, { dict }) => (
            <AlbumValueView album={value as never} dict={dict} />
        ),
    });
    const registry = {
        attributeValueStore,
        localeStore: { t: () => DICT },
    } as unknown as StoreRegistry;
    render(
        <StoreProvider store={registry}>
            <MediaViewerComponent widgetId="media-viewer-widget" />
        </StoreProvider>,
    );
    return attributeValueStore;
}

describe("MediaViewerComponent", () => {
    it("a second open starts from a fresh view state, not the previous one", async () => {
        const store = renderViewer();

        // A shorter album opens over the still-open window: the surviving
        // index would run past its end and blank the viewer.
        act(() => {
            store.openView("album", album("Trip", ["Alpha", "Bravo", "Charlie"]));
        });
        expect(screen.getByText("Trip · 1 / 3")).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole("img", { name: "Alpha" }), {
            key: "ArrowRight",
        });
        fireEvent.keyDown(screen.getByRole("img", { name: "Bravo" }), {
            key: "ArrowRight",
        });
        expect(screen.getByText("Trip · 3 / 3")).toBeInTheDocument();

        act(() => {
            store.openView("album", album("Solo", ["Delta"]));
        });
        expect(
            await screen.findByText("Solo · 1 / 1"),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Delta" }));
        expect(screen.getByText("Solo · 1 / 1")).toBeInTheDocument();
    });

    it("renders nothing until a view is opened", () => {
        renderViewer();
        expect(screen.queryByRole("img")).toBeNull();
    });
});
