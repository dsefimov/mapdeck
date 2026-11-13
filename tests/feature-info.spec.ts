import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";
import {
    PHOTOS_ROW,
    VECTOR_ROW,
    expandCollection,
    openLayerTree,
    toggleLayer,
    zoomToExtent,
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

    test("a photo point's preview opens the fullscreen viewer", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, PHOTOS_ROW, "Photo points");
        await toggleLayer(page, "photo-points", true);

        // The Ardennes demo point sits exactly at the collection bbox
        // center — fitBounds' symmetric padding puts it under the canvas
        // center, so the click lands on it deterministically.
        const itemsLoaded = page.waitForResponse(
            (res) =>
                res.url().includes("/collections/photos/items") &&
                res.status() === 200,
            { timeout: 15_000 },
        );
        await zoomToExtent(page, PHOTOS_ROW);
        await itemsLoaded;
        await page.waitForTimeout(500);

        await page.getByRole("button", { name: "Feature Info" }).click();
        await expect(page.getByText("Feature Info")).toBeVisible();

        const canvas = page.locator(".maplibregl-canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.click(
            box!.x + box!.width / 2,
            box!.y + box!.height / 2,
        );

        await expect(
            page.getByText("No features found at this location"),
        ).toBeHidden({ timeout: 15_000 });

        await page
            .getByRole("button", { name: "Ardennes viewpoint" })
            .click();

        await expect(page.getByText("Media viewer")).toBeVisible();
        await expect(page.getByRole("img", { name: "Ardennes viewpoint" })).toBeVisible();

        await page
            .getByRole("button", { name: "Close Media viewer" })
            .click();
        await expect(page.getByText("Media viewer")).toBeHidden();

        await console.assertClean("feature info photos");
    });

    test("activation from the context menu queries the right-clicked point", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, VECTOR_ROW, "Countries (MapLibre demotiles)");
        await toggleLayer(page, "demotiles-countries", true);

        await page
            .getByRole("button", { name: "Zoom to extent" })
            .nth(1)
            .click();
        await page.waitForTimeout(1500);

        const canvas = page.locator(".maplibregl-canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        // The suite runs the dev bundle, where React StrictMode remounts
        // the panel right after activation — the activation query must
        // survive it (regression: it used to abort with the first mount).
        await page.mouse.click(
            box!.x + box!.width / 2 + 70,
            box!.y + box!.height / 2 + 30,
            { button: "right" },
        );
        await page
            .getByRole("menuitem", { name: "Feature Info" })
            .click();

        await expect(
            page.getByText("No features found at this location"),
        ).toBeHidden({ timeout: 15_000 });
        await expect(page.getByText("NAME", { exact: true })).toBeVisible();

        await console.assertClean("feature info context menu");
    });
});
