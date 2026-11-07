// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SegmentsList } from "./SegmentsList";

afterEach(() => {
    cleanup();
});

describe("SegmentsList", () => {
    const TITLE = "Сегменты";
    const FIRST = "Точка 1 → 2";

    it("renders the title and one label/value pair per segment", () => {
        render(
            <SegmentsList
                title={TITLE}
                segments={[
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

    it("renders detail sub-rows when a segment has them", () => {
        render(
            <SegmentsList
                title={TITLE}
                segments={[
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
            <SegmentsList
                title={TITLE}
                segments={[
                    { label: "a", value: "1" },
                    { label: "b", value: "2", details: [] },
                ]}
            />,
        );

        expect(screen.getByText("a")).toBeInTheDocument();
        expect(screen.getByText("b")).toBeInTheDocument();
    });
});
