/**
 * One photograph shown by the media components. Structural mirror of the
 * contracts' `PhotoAttributeValue` minus the `kind` tag — the kit cannot
 * import contracts, so the consumed shape is restated here.
 */
export interface PhotoValueItem {
    url: string;
    thumbnailUrl?: string;
    title?: string;
    description?: string;
}

/** An ordered photo list shown by the album viewer (mirror of `AlbumAttributeValue`). */
export interface AlbumValueItem {
    photos: PhotoValueItem[];
    title?: string;
}

/** Core dictionary keys the media components read. */
export type MediaValueKey =
    | "mediaValue.album"
    | "mediaValue.expand"
    | "mediaValue.loadError"
    | "mediaValue.photo"
    | "mediaValue.photoCount";

export type MediaValueLabels = Record<MediaValueKey, string>;
