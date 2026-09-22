// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ColorPicker } from "./ColorPicker";

afterEach(cleanup);

function renderPicker(label: string): void {
    render(
        <ColorPicker label={label} value="#33aa55" onChange={vi.fn()} />,
    );
}

function hexField(label: string): HTMLInputElement {
    return screen.getByRole("textbox", {
        name: `${label} hex value`,
    }) as HTMLInputElement;
}

/** The div rendered just before the hex input — the committed-value swatch. */
function swatchOf(label: string): HTMLElement {
    return hexField(label).previousElementSibling as HTMLElement;
}

/** Feeds commits back as the new prop value, like a real owner would. */
function StatefulPicker({
    commits,
}: {
    readonly commits: (color: string) => void;
}) {
    const [value, setValue] = useState("#33aa55");
    return (
        <ColorPicker
            label="Accent"
            value={value}
            onChange={(color) => {
                commits(color);
                setValue(color);
            }}
        />
    );
}

function commitLog(): { commits: string[]; push: (color: string) => void } {
    const commits: string[] = [];
    return { commits, push: (color) => commits.push(color) };
}

describe("ColorPicker instance ids", () => {
    it("keeps slider ids unique for pickers sharing a label", () => {
        renderPicker("Color");
        renderPicker("Color");

        const labels = screen
            .getAllByText("Color")
            .map((node) => node.closest("label"));
        expect(labels).toHaveLength(2);

        const htmlFor = labels.map((label) => label?.getAttribute("for"));
        expect(htmlFor[0]).toBeTruthy();
        expect(htmlFor[0]).not.toBe(htmlFor[1]);

        for (const id of htmlFor) {
            expect(document.getElementById(id ?? "")).not.toBeNull();
        }
    });

    it("associates the visible label with the hue slider", () => {
        renderPicker("Accent");

        const label = screen
            .getByText("Accent")
            .closest("label") as HTMLLabelElement;
        const target = document.getElementById(
            label.getAttribute("for") ?? "",
        );

        expect(target).toBeInstanceOf(HTMLCanvasElement);
    });
});

describe("ColorPicker hex field", () => {
    it("commits a full hex value the moment the 6th hex digit lands", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "445566");

        expect(log.commits).toEqual(["#445566"]);
    });

    it("preserves the typed case in the committed value", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "33AAFF");

        expect(log.commits).toEqual(["#33AAFF"]);
    });

    it("does not commit a partial hex value", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "4455");

        expect(log.commits).toEqual([]);
    });

    it("reverts the field to the last committed value on blur of invalid input", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "zzzzzz");
        await user.tab();

        expect(log.commits).toEqual([]);
        expect(hexField("Accent")).toHaveValue("#33aa55");
    });

    it("normalizes the display and re-commits on blur of valid input", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "445566");
        await user.tab();

        expect(log.commits).toEqual(["#445566", "#445566"]);
        expect(hexField("Accent")).toHaveValue("#445566");
    });

    it("re-syncs the field when the value prop changes externally", () => {
        const { rerender } = render(
            <ColorPicker label="Accent" value="#33aa55" onChange={vi.fn()} />,
        );

        rerender(
            <ColorPicker label="Accent" value="#0051ca" onChange={vi.fn()} />,
        );

        expect(hexField("Accent")).toHaveValue("#0051ca");
    });
});

describe("ColorPicker swatch", () => {
    it("reflects the committed value, not the draft being typed", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();
        const swatch = swatchOf("Accent");
        const initial = swatch.style.backgroundColor;
        expect(initial).toBe("#33aa55");

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "445566");

        expect(log.commits).toEqual(["#445566"]);
        // happy-dom keeps the raw assignment instead of normalizing to rgb()
        expect(swatch.style.backgroundColor).toBe("#445566");
    });
});
