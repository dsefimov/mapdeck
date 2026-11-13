// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PhotoValueCell } from "./PhotoValueCell";
import { PhotoValueView } from "./PhotoValueView";
import { AlbumValueView } from "./AlbumValueView";

afterEach(cleanup);

const DICT: Record<string, string> = {
    "mediaValue.photo": "Photo",
    "mediaValue.album": "Album",
    "mediaValue.photoCount": "{count} photos",
    "mediaValue.expand": "Expand to view",
    "mediaValue.loadError": "Failed to load the image",
};

const FULL_PHOTO_URL = "/photos/a.png";

const PHOTO = {
    url: FULL_PHOTO_URL,
    thumbnailUrl: "/photos/a-thumb.png",
    title: "Alpha",
};

const ALBUM = {
    title: "Trip",
    photos: [
        { url: FULL_PHOTO_URL, thumbnailUrl: "/photos/a-t.png", title: "Alpha" },
        { url: "/photos/b.png", thumbnailUrl: "/photos/b-t.png", title: "Bravo" },
        { url: "/photos/c.png", thumbnailUrl: "/photos/c-t.png", title: "Charlie" },
    ],
};

describe("PhotoValueCell", () => {
    it("renders a labelled thumbnail button and opens on click", async () => {
        const onOpen = vi.fn();
        render(
            <PhotoValueCell photo={PHOTO} dict={DICT} onOpen={onOpen} />,
        );

        const button = screen.getByRole("button", { name: "Alpha" });
        // alt="" is decorative (the button carries the name) → presentation role.
        expect(screen.getByRole("presentation")).toHaveAttribute(
            "src",
            "/photos/a-thumb.png",
        );
        expect(button).toHaveAttribute("title", "Expand to view");

        await userEvent.click(button);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("falls back to the full url and shows the album count badge", () => {
        render(
            <PhotoValueCell
                photo={{ url: FULL_PHOTO_URL }}
                name="Trip"
                count={3}
                dict={DICT}
                onOpen={vi.fn()}
            />,
        );

        expect(screen.getByRole("presentation")).toHaveAttribute(
            "src",
            FULL_PHOTO_URL,
        );
        expect(
            screen.getByRole("button", { name: /Trip \(3 photos\)/ }),
        ).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();
    });
});

describe("PhotoValueView", () => {
    it("shows the description and surfaces a load failure", () => {
        render(
            <PhotoValueView
                photo={{ ...PHOTO, description: "A description" }}
                dict={DICT}
            />,
        );

        expect(screen.getByText("A description")).toBeInTheDocument();

        fireEvent.error(screen.getByRole("img", { name: "Alpha" }));
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Failed to load the image",
        );
    });
});

describe("AlbumValueView", () => {
    const renderAlbum = () =>
        render(<AlbumValueView album={ALBUM} dict={DICT} />);

    it("starts on the first photo with a counter", () => {
        renderAlbum();

        expect(screen.getByText("Trip · 1 / 3")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Alpha" })).toBeInTheDocument();
    });

    it("advances with arrow keys and wraps around", () => {
        renderAlbum();
        const viewer = screen
            .getByRole("img", { name: "Alpha" })
            .closest("div");

        fireEvent.keyDown(viewer as HTMLElement, { key: "ArrowRight" });
        expect(screen.getByText("Trip · 2 / 3")).toBeInTheDocument();

        fireEvent.keyDown(viewer as HTMLElement, { key: "ArrowLeft" });
        fireEvent.keyDown(viewer as HTMLElement, { key: "ArrowLeft" });
        expect(screen.getByText("Trip · 3 / 3")).toBeInTheDocument();
    });

    it("switches to a thumbnail directly", async () => {
        renderAlbum();

        await userEvent.click(screen.getByRole("button", { name: "Charlie" }));
        expect(screen.getByText("Trip · 3 / 3")).toBeInTheDocument();
    });
});
