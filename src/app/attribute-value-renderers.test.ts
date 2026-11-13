import { describe, expect, it } from "vitest";
import type {
    AlbumAttributeValue,
    PhotoAttributeValue,
} from "@core/contracts";
import {
    albumValueRenderer,
    isAlbumValue,
    isPhotoValue,
    photoValueRenderer,
} from "./attribute-value-renderers";

const photo = (url: string): PhotoAttributeValue => ({ kind: "photo", url });
const album = (
    photos: Array<{ url: string; title?: string }>,
): AlbumAttributeValue => ({
    kind: "album",
    // Entries arrive kind-less (hand-written feature data omits the tag
    // inside an album); the shape under test adds it back.
    photos: photos.map((entry) => ({ kind: "photo", ...entry })),
});

const PHOTO_URL = "/photos/a.png";

const PHOTO = { ...photo(PHOTO_URL), title: "Alpha" };
const ALBUM = {
    ...album([{ url: PHOTO_URL }, { url: "/photos/b.png" }]),
    title: "Trip",
};

describe("isPhotoValue", () => {
    it("accepts a photo tag with a non-empty url", () => {
        expect(isPhotoValue(PHOTO)).toBe(true);
        expect(isPhotoValue(photo(""))).toBe(false);
    });

    it("rejects alien shapes", () => {
        expect(isPhotoValue(null)).toBe(false);
        expect(isPhotoValue("photo")).toBe(false);
        expect(isPhotoValue({ kind: "link", url: "x" })).toBe(false);
        expect(isPhotoValue({ url: PHOTO_URL })).toBe(false);
    });
});

describe("isAlbumValue", () => {
    it("accepts a non-empty photo list, with or without entry kind tags", () => {
        expect(isAlbumValue(ALBUM)).toBe(true);
        expect(isAlbumValue(album([PHOTO]))).toBe(true);
    });

    it("rejects empty albums and non-album shapes", () => {
        expect(isAlbumValue(album([]))).toBe(false);
        expect(isAlbumValue({ ...album([]), photos: undefined })).toBe(false);
        expect(isAlbumValue({ photos: [{ url: "a" }] })).toBe(false);
        expect(
            isAlbumValue({ ...album([{ url: "x" }]), photos: [{ url: "" }] }),
        ).toBe(false);
    });
});

describe("built-in renderers", () => {
    it("claim exactly their own values", () => {
        expect(photoValueRenderer.matches(PHOTO)).toBe(true);
        expect(photoValueRenderer.matches(ALBUM)).toBe(false);
        expect(albumValueRenderer.matches(ALBUM)).toBe(true);
        expect(albumValueRenderer.matches(PHOTO)).toBe(false);
    });

    it("toText prefers the human-readable name over the url", () => {
        expect(photoValueRenderer.toText?.(PHOTO)).toBe("Alpha");
        expect(photoValueRenderer.toText?.(photo("/a.png"))).toBe("/a.png");
        expect(albumValueRenderer.toText?.(ALBUM)).toBe("Trip");
        expect(
            albumValueRenderer.toText?.(
                album([{ url: "/a.png", title: "First" }]),
            ),
        ).toBe("First");
    });

    it("describe names the dialog through the value or the dictionary", () => {
        expect(photoValueRenderer.describe?.(PHOTO, {})).toBe("Alpha");
        expect(
            photoValueRenderer.describe?.(photo("/a.png"), {
                "mediaValue.photo": "Photo",
            }),
        ).toBe("Photo");
        expect(
            albumValueRenderer.describe?.(ALBUM, {
                "mediaValue.album": "Album",
            }),
        ).toBe("Trip");
    });
});
