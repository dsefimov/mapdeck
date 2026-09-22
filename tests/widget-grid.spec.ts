import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";

test.describe("widget grid", () => {
    test("a window closes and reopens from the sidebar", async ({ page }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await page
            .getByRole("button", { name: "Select Layer Tree widget" })
            .click();
        await expect(page.getByText("Raster — Esri")).toBeVisible();

        await page.getByRole("button", { name: "Close Layer Tree" }).click();
        await expect(page.getByText("Raster — Esri")).toBeHidden();

        await page
            .getByRole("button", { name: "Select Layer Tree widget" })
            .click();
        await expect(page.getByText("Raster — Esri")).toBeVisible();

        await console.assertClean("widget close reopen");
    });

    test("dragging a window by its header moves it", async ({ page }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await page
            .getByRole("button", { name: "Select Layer Tree widget" })
            .click();

        // The header is the close button's grandparent (span wrapper →
        // header), the grid window the header's parent — the element
        // react-grid-layout translates.
        const closeButton = page.getByRole("button", {
            name: "Close Layer Tree",
        });
        const header = closeButton.locator("xpath=../..");
        const windowEl = header.locator("xpath=..");

        const headerBox = await header.boundingBox();
        expect(headerBox).not.toBeNull();

        const before = await windowEl.getAttribute("style");
        await page.mouse.move(
            headerBox!.x + headerBox!.width / 2,
            headerBox!.y + headerBox!.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
            headerBox!.x + headerBox!.width / 2 + 220,
            headerBox!.y + headerBox!.height / 2 + 120,
            { steps: 10 },
        );
        await page.mouse.up();

        const after = await windowEl.getAttribute("style");
        expect(after, "window style must change after the drag").not.toBe(
            before,
        );

        await console.assertClean("widget drag");
    });
});
