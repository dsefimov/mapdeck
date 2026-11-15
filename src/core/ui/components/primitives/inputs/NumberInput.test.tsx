// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NumberInput } from "./NumberInput";

afterEach(cleanup);

describe("NumberInput draft", () => {
    it("stays empty on clear and does not commit 0", () => {
        const onChange = vi.fn();
        const { getByRole } = render(
            <NumberInput id="n" value={5} onChange={onChange} />,
        );
        const input = getByRole("spinbutton");

        fireEvent.change(input, { target: { value: "" } });

        expect(input).toHaveValue(null); // empty number input reports null
        expect(onChange).not.toHaveBeenCalled();
    });

    it("commits only finite input", () => {
        const onChange = vi.fn();
        const { getByRole } = render(
            <NumberInput id="n" value={5} onChange={onChange} />,
        );
        const input = getByRole("spinbutton");

        fireEvent.change(input, { target: { value: "7" } });
        expect(onChange).toHaveBeenCalledWith(7);
        expect(input).toHaveValue(7);

        fireEvent.change(input, { target: { value: "" } });
        fireEvent.change(input, { target: { value: "abc" } });
        expect(input).toHaveValue(null); // empty number input reports null
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("retires the draft when the external value changes", () => {
        const onChange = vi.fn();
        const { getByRole, rerender } = render(
            <NumberInput id="n" value={5} onChange={onChange} />,
        );
        const input = getByRole("spinbutton");

        fireEvent.change(input, { target: { value: "" } });
        expect(input).toHaveValue(null);

        rerender(<NumberInput id="n" value={9} onChange={onChange} />);
        expect(input).toHaveValue(9);
    });

    it("keeps the draft when it matches the external value", () => {
        const onChange = vi.fn();
        const { getByRole, rerender } = render(
            <NumberInput id="n" value={5} onChange={onChange} />,
        );
        const input = getByRole("spinbutton");

        fireEvent.change(input, { target: { value: "5" } });
        rerender(<NumberInput id="n" value={5} onChange={onChange} />);
        expect(input).toHaveValue(5);
    });

    it("retires an empty draft when the external value becomes 0", () => {
        const onChange = vi.fn();
        const { getByRole, rerender } = render(
            <NumberInput id="n" value={5} onChange={onChange} />,
        );
        const input = getByRole("spinbutton");

        fireEvent.change(input, { target: { value: "" } });
        rerender(<NumberInput id="n" value={0} onChange={onChange} />);

        expect(input).toHaveValue(0);
    });

    it("passes a typed out-of-range value through", () => {
        const onChange = vi.fn();
        const { getByRole } = render(
            <NumberInput
                id="n"
                value={5}
                min={0}
                max={10}
                onChange={onChange}
            />,
        );
        const input = getByRole("spinbutton");

        fireEvent.change(input, { target: { value: "999" } });

        expect(onChange).toHaveBeenCalledWith(999);
    });
});
