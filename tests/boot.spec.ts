import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";

test.describe("boot (fully local)", () => {
    test("loads the app shell without console errors", async ({ page }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");

        await expect(page).toHaveTitle("Mapdeck");
        await expect(page.locator(".maplibregl-canvas")).toBeVisible();

        await console.assertClean("boot");
    });

    test("shows the demo catalog's three collections in the tree", async ({
        page,
    }) => {
        await page.goto("/");
        await page
            .getByRole("button", { name: "Select Layer Tree widget" })
            .click();

        await expect(page.getByText("Raster — Esri")).toBeVisible();
        await expect(
            page.getByText("Vector — MapLibre Demotiles"),
        ).toBeVisible();
        await expect(
            page.getByText("Point Cloud — Autzen COPC"),
        ).toBeVisible();
    });

    test("sidebar opens and closes widgets", async ({ page }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");

        const tree = page.getByRole("button", {
            name: "Select Layer Tree widget",
        });
        await tree.click();
        await expect(
            page.getByText("Point Cloud — Autzen COPC"),
        ).toBeVisible();
        await tree.click();
        await expect(page.getByText("Point Cloud — Autzen COPC")).toBeHidden();

        const settings = page.getByRole("button", {
            name: "Select Settings widget",
        });
        await settings.click();
        await expect(
            page.getByRole("button", { name: "Select Settings widget" }),
        ).toBeVisible();
        await console.assertClean("sidebar");
    });
});
