import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";
import {
    VECTOR_ROW,
    expandCollection,
    openLayerTree,
    toggleLayer,
} from "./helpers/map";

test.describe("feature info", () => {
    test("a click over land reports the country feature", async ({ page }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, VECTOR_ROW, "Countries (MapLibre demotiles)");
        await toggleLayer(page, "demotiles-countries", true);

        await page
            .getByRole("button", { name: "Zoom to extent" })
            .nth(1)
            .click();
        // Tiles are already in cache from the toggle — no new response to
        // await, just let the camera settle.
        await page.waitForTimeout(1500);

        await page.getByRole("button", { name: "Feature Info" }).click();
        await expect(page.getByText("Feature Info")).toBeVisible();

        const canvas = page.locator(".maplibregl-canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        // Center + a small offset toward Africa: the world view centers on
        // the Gulf of Guinea, so this lands on Congo/Angola — a big target.
        await page.mouse.click(
            box!.x + box!.width / 2 + 70,
            box!.y + box!.height / 2 + 30,
        );

        await expect(
            page.getByText("No features found at this location"),
        ).toBeHidden({ timeout: 15_000 });
        await expect(page.getByText("NAME", { exact: true })).toBeVisible();

        await console.assertClean("feature info vector");
    });

    test("a click over an unserved layer reports the honest empty state", async ({
        page,
    }) => {
        await page.goto("/");

        await page.getByRole("button", { name: "Feature Info" }).click();
        await expect(page.getByText("Feature Info")).toBeVisible();

        const canvas = page.locator(".maplibregl-canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

        await expect(
            page.getByText("No features found at this location"),
        ).toBeVisible({ timeout: 15_000 });
    });
});
