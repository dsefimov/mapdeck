import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";

/**
 * The demo catalog carries no WFS source, so the honest full-table flow
 * (rows, sorting, filtering) has no data to run against here — those stay
 * manual until a WFS demo item exists. What the demo does prove: the widget
 * mounts, states its empty condition, and closes.
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
});
