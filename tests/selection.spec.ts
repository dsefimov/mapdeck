import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";
import {
    PHOTOS_ROW,
    expandCollection,
    openLayerTree,
    toggleLayer,
    zoomToExtent,
} from "./helpers/map";

test.describe("selection", () => {
    test("a map click selects, the table follows, the selection outlives the tool", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, PHOTOS_ROW, "Photo points");
        await toggleLayer(page, "photo-points", true);

        const itemsLoaded = page.waitForResponse(
            (res) =>
                res.url().includes("/collections/photos/items") &&
                res.status() === 200,
            { timeout: 15_000 },
        );
        await zoomToExtent(page, PHOTOS_ROW);
        await itemsLoaded;
        await page.waitForTimeout(500);

        // Activate the tool — the target defaults to the only
        // selectable layer.
        await page.getByRole("button", { name: "Select Features" }).click();
        await expect(page.locator("#selection-target-layer")).toContainText(
            "Photo points",
        );

        // The Ardennes demo point sits exactly under the canvas center
        // after fitBounds (see the feature-info spec for the reasoning).
        const canvas = page.locator(".maplibregl-canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

        await expect(page.getByText("Nothing selected yet")).toBeHidden();
        await expect(
            page.getByRole("button", { name: "Clear all" }),
        ).toBeVisible();

        // The attribute table follows the map-side selection.
        await page
            .getByRole("button", { name: "Select Attribute Table widget" })
            .click();
        await page
            .getByRole("button", { name: "Select layer for attribute table" })
            .click();
        await page.getByRole("option", { name: "Photo points" }).click();
        await expect(
            page.getByText("Ardennes viewpoint").first(),
        ).toBeVisible({ timeout: 15_000 });
        const ardennesRow = page.getByRole("row", {
            name: /Ardennes viewpoint/,
        });
        await expect(
            ardennesRow.getByRole("checkbox", { name: "Select row" }),
        ).toBeChecked();

        // Deactivating the tool keeps the selection (QGIS-like).
        await page.keyboard.press("Escape");
        await expect(page.getByText("Nothing selected yet")).toBeHidden();
        await expect(
            ardennesRow.getByRole("checkbox", { name: "Select row" }),
        ).toBeChecked();

        await console.assertClean("selection photos");
    });
});
