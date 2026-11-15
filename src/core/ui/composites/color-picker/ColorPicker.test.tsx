// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ColorPicker } from "./ColorPicker";

afterEach(cleanup);

const DICT = {
    "colorPicker.hexField": "{label} — hex value",
    "colorPicker.hueField": "{label} — hue",
};

function renderPicker(label: string): void {
    render(
        <ColorPicker
            label={label}
            dict={DICT}
            value="#33aa55"
            onChange={vi.fn()}
        />,
    );
}

function hexField(label: string): HTMLInputElement {
    return screen.getByRole("textbox", {
        name: `${label} — hex value`,
    }) as HTMLInputElement;
}

function hueSlider(label: string): HTMLElement {
    return screen.getByRole("slider", { name: `${label} — hue` });
}

const HOSTILE_LABEL = "Fill";
const ARIA_VALUENOW = "aria-valuenow";

/** The div rendered just before the hex input — the committed-value swatch. */
function swatchOf(label: string): HTMLElement {
    return hexField(label).previousElementSibling as HTMLElement;
}

describe("ColorPicker with hostile values", () => {
    it("renders a non-hex style value instead of crashing", () => {
        // Style colors arrive from layer data — rgb()/named values must not
        // take the whole widget down through hexToHue's throw.
        render(
            <ColorPicker
                label={HOSTILE_LABEL}
                dict={DICT}
                value="rgb(255, 0, 0)"
                onChange={vi.fn()}
            />,
        );

        expect(hexField(HOSTILE_LABEL)).toHaveValue("rgb(255, 0, 0)");
        expect(hueSlider(HOSTILE_LABEL)).toHaveAttribute(ARIA_VALUENOW, "0");
    });

    it("keeps the hue of a short hex form", () => {
        render(
            <ColorPicker
                label={HOSTILE_LABEL}
                dict={DICT}
                value="#0f0"
                onChange={vi.fn()}
            />,
        );

        expect(hueSlider(HOSTILE_LABEL)).toHaveAttribute(
            ARIA_VALUENOW,
            "120",
        );
    });
});

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
            dict={DICT}
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

        expect(target).toHaveAttribute("role", "slider");
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

    it("normalizes the committed value to lowercase", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "33AAFF");

        expect(log.commits).toEqual(["#33aaff"]);
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

    it("normalizes the display on blur without re-committing", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        await user.clear(hexField("Accent"));
        await user.type(hexField("Accent"), "445566");
        await user.tab();

        expect(log.commits).toEqual(["#445566"]);
        expect(hexField("Accent")).toHaveValue("#445566");
    });

    it("re-syncs the field when the value prop changes externally", () => {
        const { rerender } = render(
            <ColorPicker
                label="Accent"
                dict={DICT}
                value="#33aa55"
                onChange={vi.fn()}
            />,
        );

        rerender(
            <ColorPicker
                label="Accent"
                dict={DICT}
                value="#0051ca"
                onChange={vi.fn()}
            />,
        );

        expect(hexField("Accent")).toHaveValue("#0051ca");
    });
});

describe("ColorPicker hue state", () => {
    function hueOf(): number {
        return Number(
            screen.getByRole("slider").getAttribute(ARIA_VALUENOW),
        );
    }

    it("keeps hue 360 when its own commit echoes back as #ff0000", async () => {
        const log = commitLog();
        render(<StatefulPicker commits={log.push} />);
        const user = userEvent.setup();

        const slider = screen.getByRole("slider");
        slider.focus();
        await user.keyboard("{End}");

        expect(log.commits).toEqual(["#ff0000"]);
        // The echo of hue 360 is red — recomputing the hue from it would
        // snap the thumb from the right edge back to 0.
        expect(hueOf()).toBe(360);
    });

    it("recomputes the hue only for an external value the hue cannot produce", () => {
        const { rerender } = render(
            <ColorPicker
                label="Accent"
                dict={DICT}
                value="#ff0000"
                onChange={vi.fn()}
            />,
        );
        expect(hueOf()).toBe(0);

        // A gray has no hue — it reads as 0, thumb stays left.
        rerender(
            <ColorPicker
                label="Accent"
                dict={DICT}
                value="#808080"
                onChange={vi.fn()}
            />,
        );
        expect(hueOf()).toBe(0);

        rerender(
            <ColorPicker
                label="Accent"
                dict={DICT}
                value="#00ff00"
                onChange={vi.fn()}
            />,
        );
        expect(hueOf()).toBe(120);
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
