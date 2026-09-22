import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The demo point-cloud file the engine range-requests. */
export const COPC_URL_PATTERN = /autzen-classified\.copc\.laz/;

/** Collection rows as the tree renders them (title — provider). */
export const RASTER_ROW = "Raster — Esri";
export const VECTOR_ROW = "Vector — MapLibre Demotiles";
export const CLOUD_ROW = "Point Cloud — Autzen COPC";

/**
 * The demo tree's row order. Text-based row scoping is unreliable here
 * (ancestor containers match every hasText filter), while every row renders
 * exactly one button per action name — indexing by row order and letting
 * each call assert its effect keeps this honest.
 */
const ROW_ORDER = [RASTER_ROW, VECTOR_ROW, CLOUD_ROW] as const;

export type TreeRow = (typeof ROW_ORDER)[number];

function rowButton(page: Page, row: TreeRow, name: string | RegExp) {
    return page.getByRole("button", { name }).nth(ROW_ORDER.indexOf(row));
}

/** Open the layer-tree widget from the sidebar. */
export async function openLayerTree(page: Page): Promise<void> {
    await page
        .getByRole("button", { name: "Select Layer Tree widget" })
        .click();
    await expect(page.getByText(CLOUD_ROW)).toBeVisible();
}

/**
 * Expand a collection; `expectItem` self-verifies the right row answered —
 * if the index ever drifts, the test fails loudly instead of misclicking.
 */
export async function expandCollection(
    page: Page,
    row: TreeRow,
    expectItem?: string,
): Promise<void> {
    await rowButton(page, row, /^(Expand|Collapse)$/).click();
    if (expectItem) {
        await expect(page.getByText(expectItem)).toBeVisible();
    }
}

/** Toggle a layer visibility switch by its item/collection id. */
export async function toggleLayer(
    page: Page,
    id: string,
    on: boolean,
): Promise<void> {
    const checkbox = page.locator(`#visibility-${id}`);
    if ((await checkbox.isChecked()) !== on) {
        await page.locator(`label[for="visibility-${id}"]`).click();
    }
    await expect(checkbox).toBeChecked({ checked: on });
}

/**
 * Enable the point-cloud layer and fly the camera to it, then wait for the
 * streaming engine to actually pull node data: N successful range requests.
 * Per the owner's decision the assertion stops here — the basemap makes
 * pixel-level rendering checks meaningless.
 */
export async function loadPointCloud(
    page: Page,
    minRangeRequests = 10,
): Promise<void> {
    await toggleLayer(page, "autzen-pointcloud", true);

    await rowButton(page, CLOUD_ROW, "Zoom to extent").click();

    let rangeHits = 0;
    const deadline = Date.now() + 60_000;
    while (rangeHits < minRangeRequests && Date.now() < deadline) {
        const response = await page.waitForResponse(
            (res) => COPC_URL_PATTERN.test(res.url()) && res.status() === 206,
            { timeout: 20_000 },
        );
        expect(response.status()).toBe(206);
        rangeHits++;
    }
    expect(
        rangeHits,
        "streaming engine delivered range requests",
    ).toBeGreaterThanOrEqual(minRangeRequests);
}
