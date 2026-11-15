// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ColorSlider } from "./ColorSlider";

afterEach(cleanup);

/** Feeds commits back as the new prop value, like a real owner would. */
function StatefulSlider() {
    const [hue, setHue] = useState(120);
    return (
        <ColorSlider
            id="hue"
            value={hue}
            onChange={setHue}
            label="Hue"
        />
    );
}

function hueOf(): number {
    return Number(screen.getByRole("slider").getAttribute("aria-valuenow"));
}

describe("ColorSlider keyboard", () => {
    it("walks by 5° with arrows and 30° with Shift", async () => {
        render(<StatefulSlider />);
        const user = userEvent.setup();
        const slider = screen.getByRole("slider");
        slider.focus();

        await user.keyboard("{ArrowRight}");
        expect(hueOf()).toBe(125);
        await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
        expect(hueOf()).toBe(155);
        await user.keyboard("{ArrowDown}");
        expect(hueOf()).toBe(150);
        await user.keyboard("{ArrowUp}");
        expect(hueOf()).toBe(155);
    });

    it("jumps to the wheel edges with Home/End and clamps there", async () => {
        render(<StatefulSlider />);
        const user = userEvent.setup();
        const slider = screen.getByRole("slider");
        slider.focus();

        await user.keyboard("{Home}");
        expect(hueOf()).toBe(0);
        await user.keyboard("{ArrowLeft}");
        expect(hueOf()).toBe(0);

        await user.keyboard("{End}");
        expect(hueOf()).toBe(360);
        await user.keyboard("{ArrowRight}");
        expect(hueOf()).toBe(360);
    });

    it("reports the hue in degrees via aria-valuetext", () => {
        render(<StatefulSlider />);
        expect(screen.getByRole("slider")).toHaveAttribute(
            "aria-valuetext",
            "120°",
        );
    });
});

describe("ColorSlider pointer", () => {
    it("maps a pointer press to the hue at that x position", () => {
        render(<StatefulSlider />);
        const slider = screen.getByRole("slider");
        vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
            left: 0,
            top: 0,
            width: 100,
            height: 16,
            right: 100,
            bottom: 16,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);

        act(() => {
            slider.dispatchEvent(
                new PointerEvent("pointerdown", {
                    bubbles: true,
                    clientX: 50,
                    pointerId: 1,
                }),
            );
        });

        expect(hueOf()).toBe(180);
    });
});
