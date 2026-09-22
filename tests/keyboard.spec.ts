import { expect, test } from "@playwright/test";
import { CLOUD_ROW, expandCollection, openLayerTree } from "./helpers/map";

test.describe("keyboard", () => {
    test("menu arrows rove focus and Escape closes the menu", async ({
        page,
    }) => {
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, CLOUD_ROW, "Autzen Stadium LiDAR");

        await page.getByRole("button", { name: "More options" }).click();
        const menu = page.getByTestId("collapsible-menu");
        await expect(menu).toBeVisible();
        await expect(page.getByText("Point size:")).toBeVisible();

        await menu.click({ position: { x: 5, y: 5 } });
        await page.keyboard.press("ArrowDown");
        const activeRole = await menu.evaluate(
            (node) =>
                (node.ownerDocument.activeElement as HTMLElement | null)
                    ?.tagName ?? "none",
        );
        expect(
            activeRole,
            "ArrowDown must move focus into the menu's focusables",
        ).not.toBe("BODY");

        await page.keyboard.press("Escape");
        await expect(page.getByText("Point size:")).toBeHidden();
    });
});
