/**
 * Attribute value rendering contract.
 *
 * Attribute values are open data (`unknown`) — no schema describes them.
 * A value opts into rich rendering by its shape: a renderer whose `matches`
 * accepts the value renders its table cell and, optionally, a fullscreen
 * viewer opened on cell click. Registration order decides precedence: the
 * first registered renderer that matches a value wins, so built-ins stay
 * replaceable through `{ override: true }` or a sharper predicate.
 */
import type { ReactNode } from "react";
import type { RegisterOptions } from "@core/lib/registry";

/** A single photograph stored as an attribute value. */
export interface PhotoAttributeValue {
    kind: "photo";
    url: string;
    /** Small preview URL; the cell falls back to `url` when absent. */
    thumbnailUrl?: string;
    title?: string;
    description?: string;
}

/** An ordered list of photographs stored as one attribute value. */
export interface AlbumAttributeValue {
    kind: "album";
    photos: PhotoAttributeValue[];
    title?: string;
}

/** Ambient API handed to a renderer's cell rendering. */
export interface AttributeValueCellApi {
    open(): void;
    /**
     * Renderers read the keys they declare from it; the contract stays
     * neutral to the key set.
     */
    dict: Readonly<Record<string, string>>;
}

/** Ambient API handed to a renderer's fullscreen viewer rendering. */
export interface AttributeValueViewerApi {
    close(): void;
    dict: Readonly<Record<string, string>>;
}

/**
 * Renders attribute values of one shape: a compact cell for the data table
 * and, optionally, a fullscreen viewer. The system supplies the viewer's
 * dialog shell (scrim, Escape, focus), so `renderViewer` returns content,
 * not chrome.
 */
export interface AttributeValueRenderer {
    id: string;
    /** Whether this renderer claims the value; checked in registration order. */
    matches(value: unknown): boolean;
    /** Compact rendering inside a table cell; `api.open` is wired to the viewer. */
    renderCell(value: unknown, api: AttributeValueCellApi): ReactNode;
    /**
     * Fullscreen content rendered inside the system lightbox. Absent means
     * the cell is not clickable.
     */
    renderViewer?(value: unknown, api: AttributeValueViewerApi): ReactNode;
    /**
     * Plain-text form used by table filtering; falls back to JSON
     * serialization when absent.
     */
    toText?(value: unknown): string;
    /**
     * Accessible name of the fullscreen dialog for a value; falls back to
     * the renderer id.
     */
    describe?(value: unknown, dict: Readonly<Record<string, string>>): string;
}

/** Registration surface for attribute value renderers. */
export interface AttributeValueRendererRegistrationPort {
    register(renderer: AttributeValueRenderer, opts?: RegisterOptions): void;
}
