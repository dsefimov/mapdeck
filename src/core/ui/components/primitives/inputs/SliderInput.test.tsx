// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SliderInput } from "./SliderInput";

afterEach(cleanup);

function getSlider(): HTMLInputElement {
    return screen.getByRole("slider") as HTMLInputElement;
}

function renderSlider(value: number, min = 0, max = 10): void {
    render(
        <SliderInput id="s" min={min} max={max} value={value} onChange={vi.fn()} />,
    );
}

describe("SliderInput fill", () => {
    function fillOf(slider: HTMLInputElement): string {
        return slider.style.getPropertyValue("--slider-fill");
    }

    it.each([
        [0, "0%"],
        [5, "50%"],
        [10, "100%"],
    ])("maps value %p of [0,10] to fill %s", (value, expected) => {
        renderSlider(value);
        expect(fillOf(getSlider())).toBe(expected);
    });

    it("does not clamp an out-of-range value into the fill", () => {
        renderSlider(15);
        expect(fillOf(getSlider())).toBe("150%");
    });

    it("falls back to 0% on a degenerate range (max <= min), not NaN", () => {
        renderSlider(2, 2, 2);
        expect(fillOf(getSlider())).toBe("0%");
    });
});

describe("SliderInput onChange", () => {
    it("converts the DOM string to a number before calling onChange", () => {
        const onChange = vi.fn();
        render(
            <SliderInput
                id="s"
                min={0}
                max={10}
                value={5}
                onChange={onChange}
            />,
        );

        fireEvent.change(getSlider(), { target: { value: "7" } });

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(7);
    });
});

describe("SliderInput onCommit", () => {
    it("fires onCommit on pointer release", () => {
        const onCommit = vi.fn();
        render(
            <SliderInput
                id="s"
                min={0}
                max={10}
                value={5}
                onChange={vi.fn()}
                onCommit={onCommit}
            />,
        );

        fireEvent.pointerUp(getSlider());
        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it("survives without onCommit", () => {
        render(<SliderInput id="s" min={0} max={10} value={5} onChange={vi.fn()} />);
        expect(() =>
            fireEvent.pointerUp(getSlider()),
        ).not.toThrow();
    });
});
