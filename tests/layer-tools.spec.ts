import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers/console";
import {
    CLOUD_ROW,
    expandCollection,
    openLayerTree,
} from "./helpers/map";

test.describe("layer tools", () => {
    test("the cloud node's tool menu opens with its bound tools", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, CLOUD_ROW, "Autzen Stadium LiDAR");

        // "More options" exists per item row; the cloud item is the only
        // one expanded here.
        await page.getByRole("button", { name: "More options" }).click();

        await expect(page.getByText("Point size:")).toBeVisible();
        await expect(page.getByText("Color by:")).toBeVisible();

        await console.assertClean("layer tool menu");
    });

    test("the point-size slider writes the committed size into the layer style", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, CLOUD_ROW, "Autzen Stadium LiDAR");

        await page.getByRole("button", { name: "More options" }).click();
        const slider = page.locator("#pointSize");
        await expect(slider).toBeVisible();

        // The COPC default point size is 2.0 — the slider maximum — so the
        // only keyboard move available is down: 2.0 → 1.9.
        await expect(slider).toHaveValue("2");
        await slider.focus();
        await page.keyboard.press("ArrowLeft");

        // The label renders the node's committed style: keyboard → debounce
        // → setPointSize → updateLayerStyle → observer re-render.
        await expect(page.getByText("Point size: 1.9 px")).toBeVisible();
        await expect(slider).toHaveValue("1.9");

        await console.assertClean("point size slider");
    });

    test("selecting a color scheme writes it into the layer style", async ({
        page,
    }) => {
        const console = collectConsoleErrors(page);
        await page.goto("/");
        await openLayerTree(page);
        await expandCollection(page, CLOUD_ROW, "Autzen Stadium LiDAR");

        await page.getByRole("button", { name: "More options" }).click();
        const trigger = page.locator("#point-color-scheme");
        await expect(trigger).toContainText("RGB/natural colors");

        await trigger.click();
        await page.getByRole("option", { name: "By elevation" }).click();

        // The trigger text re-renders from the node's committed metadata.
        await expect(trigger).toContainText("By elevation");

        await trigger.click();
        await expect(
            page.getByRole("option", { name: "By elevation" }),
        ).toHaveAttribute("aria-selected", "true");

        await console.assertClean("color scheme selector");
    });
});
