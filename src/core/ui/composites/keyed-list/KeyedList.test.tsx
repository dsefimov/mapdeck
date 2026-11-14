// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { KeyedList } from "./KeyedList";

afterEach(() => {
    cleanup();
});

describe("KeyedList", () => {
    const TITLE = "Сегменты";
    const FIRST = "Точка 1 → 2";

    it("renders the title and one label/value pair per row", () => {
        render(
            <KeyedList
                title={TITLE}
                rows={[
                    { label: FIRST, value: "12.3 м" },
                    { label: "Точка 2 → 3", value: "4.5 м" },
                ]}
            />,
        );

        expect(screen.getByText(TITLE)).toBeInTheDocument();
        expect(screen.getByText(FIRST)).toBeInTheDocument();
        expect(screen.getByText("12.3 м")).toBeInTheDocument();
        expect(screen.getByText("Точка 2 → 3")).toBeInTheDocument();
        expect(screen.getByText("4.5 м")).toBeInTheDocument();
    });

    it("renders detail sub-rows when a row has them", () => {
        render(
            <KeyedList
                title={TITLE}
                rows={[
                    {
                        label: FIRST,
                        value: "12.3 м",
                        details: [
                            { label: "Горизонтально", value: "12.0 м" },
                            { label: "Вертикально", value: "0.3 м" },
                        ],
                    },
                ]}
            />,
        );

        expect(screen.getByText("Горизонтально")).toBeInTheDocument();
        expect(screen.getByText("12.0 м")).toBeInTheDocument();
        expect(screen.getByText("Вертикально")).toBeInTheDocument();
        expect(screen.getByText("0.3 м")).toBeInTheDocument();
    });

    it("omits the details block when details are absent or empty", () => {
        render(
            <KeyedList
                title={TITLE}
                rows={[
                    { label: "a", value: "1" },
                    { label: "b", value: "2", details: [] },
                ]}
            />,
        );

        expect(screen.getByText("a")).toBeInTheDocument();
        expect(screen.getByText("b")).toBeInTheDocument();
    });

    it("renders one action node per row", () => {
        const first = vi.fn();
        const second = vi.fn();
        render(
            <KeyedList
                title={TITLE}
                rows={[
                    { label: "a", value: "1" },
                    { label: "b", value: "2" },
                ]}
                actions={[
                    <button key="a" onClick={first}>
                        act-a
                    </button>,
                    <button key="b" onClick={second}>
                        act-b
                    </button>,
                ]}
            />,
        );

        expect(screen.getByRole("button", { name: "act-a" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "act-b" })).toBeInTheDocument();
    });
});
