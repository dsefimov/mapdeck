import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";
import { stubExternalTiles } from "./helpers/tiles";
import {
    CLOUD_ROW,
    COPC_URL_PATTERN,
    RASTER_ROW,
    VECTOR_ROW,
    expandCollection,
    openLayerTree,
    toggleLayer,
} from "./helpers/map";

test.describe("layers", () => {
    test("raster layer toggles on and off with tiles flowing", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, RASTER_ROW, "World Shaded Relief (Esri)");

        await toggleLayer(page, "esri-world-shaded-relief", true);
        const tile = await page.waitForResponse(
            (res) =>
                res.url().includes("arcgisonline.com") && res.status() === 200,
            { timeout: 20_000 },
        );
        expect(tile.status()).toBe(200);

        await toggleLayer(page, "esri-world-shaded-relief", false);
        await console.assertClean("raster toggle");
    });

    test("vector layers toggle without errors", async ({ page }) => {
        const console = collectConsoleErrors(page);
        await stubExternalTiles(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(
            page,
            VECTOR_ROW,
            "Countries (MapLibre demotiles)",
        );

        // Listen before toggling: the stubbed tiles respond instantly, so a
        // wait started after the toggles would miss the responses.
        const firstTile = page.waitForResponse(
            (res) => res.url().includes("demotiles.maplibre.org"),
            { timeout: 10_000 },
        );
        for (const id of [
            "demotiles-countries",
            "demotiles-geolines",
            "demotiles-centroids",
        ]) {
            await toggleLayer(page, id, true);
        }
        await firstTile;
        await console.assertClean("vector toggle");
    });

    test("point cloud streams over range requests after zoom to extent", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);

        await toggleLayer(page, "autzen-pointcloud", true);
        await page
            .getByRole("button", { name: "Zoom to extent" })
            .nth(2)
            .click();

        let rangeHits = 0;
        const deadline = Date.now() + 60_000;
        while (rangeHits < 10 && Date.now() < deadline) {
            const response = await page.waitForResponse(
                (res) =>
                    COPC_URL_PATTERN.test(res.url()) && res.status() === 206,
                { timeout: 20_000 },
            );
            expect(response.status()).toBe(206);
            rangeHits++;
        }
        expect(rangeHits).toBeGreaterThanOrEqual(10);
        await console.assertClean("point cloud streaming");
    });

    test("search narrows the tree to matching nodes", async ({ page }) => {
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(
            page,
            VECTOR_ROW,
            "Countries (MapLibre demotiles)",
        );

        await page
            .getByRole("textbox", { name: "Search layers" })
            .fill("autzen");

        await expect(
            page.getByText("Countries (MapLibre demotiles)"),
        ).toBeHidden();
        await expect(page.getByText(CLOUD_ROW)).toBeVisible();
    });

    test("collection rows expand and collapse", async ({ page }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);

        const countries = page.getByText("Countries (MapLibre demotiles)");
        await expect(countries).toBeHidden();

        await expandCollection(
            page,
            VECTOR_ROW,
            "Countries (MapLibre demotiles)",
        );
        await page
            .getByRole("button", { name: /^(Expand|Collapse)$/ })
            .nth(1)
            .click();
        await expect(countries).toBeHidden();

        await console.assertClean("expand collapse");
    });
});
