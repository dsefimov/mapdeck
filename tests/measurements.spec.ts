import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";
import { loadPointCloud, openLayerTree } from "./helpers/map";

test.describe("measurements", () => {
    // Cloud loading (zoom + streaming) exceeds the default 30s budget.
    test.setTimeout(120_000);

    test("ruler measures a segment on the cloud and undoes it", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        // Five delivered nodes are plenty for picking at extent zoom —
        // the full ten only slow the test down against real network.
        await loadPointCloud(page, 5);

        await page
            .getByRole("button", { name: "Measure 3D Distance" })
            .click();
        await expect(page.getByText("3D Ruler")).toBeVisible();
        await expect(
            page.getByText("No click yet", { exact: false }),
        ).toBeHidden();
        const canvas = page.locator(".maplibregl-canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();

        const undo = page.getByRole("button", { name: /Undo/ });
        // The controller attaches its map-click listeners in the panel's
        // mount effect; if the first physical click races that attach, no
        // point lands and Undo stays disabled — retry until it registers.
        await expect(async () => {
            await page.mouse.click(
                box!.x + box!.width / 2,
                box!.y + box!.height / 2,
            );
            await expect(undo).toBeEnabled({ timeout: 2_000 });
        }).toPass({ timeout: 10_000 });
        await page.mouse.click(
            box!.x + box!.width / 2 + 80,
            box!.y + box!.height / 2 - 60,
        );

        await expect(
            page.getByText("Total 3D distance:", { exact: false }),
        ).toBeVisible();

        await undo.click();
        await page.getByRole("button", { name: "Close Tool" }).click();
        await expect(page.getByText("3D Ruler")).toBeHidden();

        await console.assertClean("ruler");
    });

    test("activating another measure tool closes the current panel", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await loadPointCloud(page);

        await page
            .getByRole("button", { name: "Measure 3D Distance" })
            .click();
        await expect(page.getByText("3D Ruler")).toBeVisible();

        await page.getByRole("button", { name: "Measure Area" }).click();
        await expect(page.getByText("3D Ruler")).toBeHidden();
        await expect(page.getByText("Area Measure")).toBeVisible();

        await console.assertClean("tool exclusivity");
    });
});
