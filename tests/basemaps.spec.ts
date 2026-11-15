import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";

test.describe("basemaps", () => {
    test("switches basemaps with tile traffic following the choice", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");

        await page.getByRole("button", { name: "Basemap" }).click();
        await expect(page.getByText("OpenStreetMap Standard")).toBeVisible();
        await expect(page.getByText("Esri World Imagery")).toBeVisible();

        // Selecting a card does not close the panel — the grid stays open.
        await page.getByText("Esri World Imagery").click();
        await page.waitForResponse(
            (res) =>
                res.url().includes("arcgisonline.com") && res.status() === 200,
            { timeout: 20_000 },
        );

        await page.getByText("OpenStreetMap Standard").click();
        await page.waitForResponse(
            (res) =>
                res.url().includes("tile.openstreetmap.org") &&
                res.status() === 200,
            { timeout: 20_000 },
        );

        await console.assertClean("basemap switch");
    });
});
