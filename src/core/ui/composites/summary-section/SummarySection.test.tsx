// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SummarySection } from "./SummarySection";

afterEach(() => {
    cleanup();
});

describe("SummarySection", () => {
    it("renders label/value rows", () => {
        render(
            <SummarySection
                items={[
                    { label: "Длина", value: "42 м" },
                    { label: "Площадь", value: "108 м²" },
                ]}
            />,
        );

        expect(screen.getByText("Длина")).toBeInTheDocument();
        expect(screen.getByText("42 м")).toBeInTheDocument();
        expect(screen.getByText("Площадь")).toBeInTheDocument();
        expect(screen.getByText("108 м²")).toBeInTheDocument();
    });

    it("renders the colored dot only for items that ask for one", () => {
        const HORIZONTAL = "Горизонтальная";
        const VERTICAL = "Вертикальная";
        render(
            <SummarySection
                items={[
                    { label: HORIZONTAL, value: "1", dot: "horizontal" },
                    { label: VERTICAL, value: "2", dot: "vertical" },
                    { label: "Без маркера", value: "3" },
                ]}
            />,
        );

        // The dot is the empty span rendered inside the label's Text node.
        const dotOf = (label: string): Element | null =>
            screen.getByText(label).querySelector("span");

        expect(dotOf(HORIZONTAL)).not.toBeNull();
        expect(dotOf(VERTICAL)).not.toBeNull();
        expect(dotOf("Без маркера")).toBeNull();
        // The two dots carry different color classes.
        expect(dotOf(HORIZONTAL)?.className).not.toBe(
            dotOf(VERTICAL)?.className,
        );
    });
});
