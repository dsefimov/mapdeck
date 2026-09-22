import type { Page } from "@playwright/test";

/**
 * Fulfill every external tile request with a synthesized payload, so tests
 * run without network access. The goal is only to keep third-party decoders
 * quiet (the console guard fails on their errors), not to exercise their
 * logic: an empty body is a valid protobuf (a featureless vector tile), and
 * raster needs a decodable image.
 */

// Well-known 1×1 transparent PNG.
const TRANSPARENT_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

/** Fulfill external tile requests with minimal silent payloads. */
export async function stubExternalTiles(page: Page): Promise<void> {
    await page.route("**/demotiles.maplibre.org/**", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/vnd.mapbox-vector-tile",
        }),
    );
    await page.route("**/tile.openstreetmap.org/**", (route) =>
        route.fulfill({
            status: 200,
            body: TRANSPARENT_PNG,
            contentType: "image/png",
        }),
    );
    await page.route("**/server.arcgisonline.com/**", (route) =>
        route.fulfill({
            status: 200,
            body: TRANSPARENT_PNG,
            contentType: "image/png",
        }),
    );
}
