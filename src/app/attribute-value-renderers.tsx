import type { ReactNode } from "react";
import type {
    AlbumAttributeValue,
    AttributeValueRenderer,
    PhotoAttributeValue,
} from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import {
    AlbumValueView,
    PhotoValueCell,
    PhotoValueView,
} from "@core/ui/composites";

export const PHOTO_VALUE_RENDERER_ID = "photo";
export const ALBUM_VALUE_RENDERER_ID = "album";

export function isPhotoValue(value: unknown): value is PhotoAttributeValue {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        record.kind === "photo" &&
        typeof record.url === "string" &&
        record.url.length > 0
    );
}

/** An album value: the `kind` tag plus at least one photo-shaped entry. */
export function isAlbumValue(value: unknown): value is AlbumAttributeValue {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    if (record.kind !== "album" || !Array.isArray(record.photos)) return false;
    // Entries are accepted with or without their own `kind` tag —
    // hand-written feature data usually omits it inside an album.
    return record.photos.length > 0 && record.photos.every(isPhotoEntry);
}

function isPhotoEntry(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const url = (value as Record<string, unknown>).url;
    return typeof url === "string" && url.length > 0;
}

export const photoValueRenderer: AttributeValueRenderer = {
    id: PHOTO_VALUE_RENDERER_ID,
    matches: isPhotoValue,
    renderCell: (value, { open, dict }): ReactNode =>
        isPhotoValue(value) ? (
            <PhotoValueCell photo={value} dict={dict} onOpen={open} />
        ) : null,
    renderViewer: (value, { dict }): ReactNode =>
        isPhotoValue(value) ? (
            <PhotoValueView photo={value} dict={dict} />
        ) : null,
    toText: (value) =>
        isPhotoValue(value) ? value.title ?? value.url : String(value),
};

export const albumValueRenderer: AttributeValueRenderer = {
    id: ALBUM_VALUE_RENDERER_ID,
    matches: isAlbumValue,
    renderCell: (value, { open, dict }): ReactNode => {
        if (!isAlbumValue(value)) return null;
        const first = value.photos[0];
        if (!first) return null;
        return (
            <PhotoValueCell
                photo={first}
                name={value.title}
                count={value.photos.length}
                dict={dict}
                onOpen={open}
            />
        );
    },
    renderViewer: (value, { dict }): ReactNode =>
        isAlbumValue(value) ? (
            <AlbumValueView album={value} dict={dict} />
        ) : null,
    toText: (value) => {
        if (!isAlbumValue(value)) return String(value);
        const first = value.photos[0];
        return value.title ?? first?.title ?? first?.url ?? "";
    },
};

/**
 * Registers the built-in attribute value renderers. Runs before module
 * registration, so a module's renderer can shadow a built-in through
 * `{ override: true }` or a sharper predicate.
 */
export function registerAttributeRenderers(rootStore: StoreRegistry): void {
    rootStore.attributeValueStore.register(photoValueRenderer);
    rootStore.attributeValueStore.register(albumValueRenderer);
}
