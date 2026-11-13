import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";
import { PHOTOS_ROW, expandCollection, openLayerTree } from "./helpers/map";

/**
 * The demo catalog's WFS-shaped sources are the photo points (static
 * OGC-Features-shaped JSON): they exercise the full table flow — rows,
 * previews — and the album carousel through the fullscreen viewer.
 */
test.describe("attribute table", () => {
    test("opens with the no-WFS-data empty state and closes", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");

        await page
            .getByRole("button", { name: "Select Attribute Table widget" })
            .click();

        await expect(
            page.getByText("No layers with WFS attribute data available"),
        ).toBeVisible();

        await page
            .getByRole("button", { name: "Close Attribute Table" })
            .click();
        await expect(
            page.getByText("No layers with WFS attribute data available"),
        ).toBeHidden();

        await console.assertClean("attribute table");
    });

    test("photo values render as previews and open the carousel", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");

        // The tree loads collection children lazily — the layer select lists
        // data-bound layers only after the Photos collection is expanded.
        await openLayerTree(page);
        await expandCollection(page, PHOTOS_ROW, "Photo points");

        await page
            .getByRole("button", { name: "Select Attribute Table widget" })
            .click();

        await page
            .getByRole("button", { name: "Select layer for attribute table" })
            .click();
        await page.getByRole("option", { name: "Photo points" }).click();

        // Photo cells render as labelled preview buttons once the page loads.
        const photoCell = page.getByRole("button", {
            name: "Eiffel Tower from Champ de Mars",
        });
        await expect(photoCell).toBeVisible({ timeout: 15_000 });

        // The album preview opens the viewer as a maximized widget window.
        await page
            .getByRole("button", { name: "Paris (3 photos)" })
            .click();
        await expect(page.getByText("Media viewer")).toBeVisible();
        await expect(page.getByText("1 / 3")).toBeVisible();

        await page
            .getByRole("button", { name: "Across the Seine" })
            .click();
        await expect(page.getByText("2 / 3")).toBeVisible();

        await page
            .getByRole("button", { name: "Close Media viewer" })
            .click();
        await expect(page.getByText("1 / 3")).toBeHidden();

        await console.assertClean("attribute table photos");
    });
});
