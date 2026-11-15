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

    it("renders the colored marker only for items that ask for one", () => {
        const MUTED = "Приглушённая";
        const ACCENT = "Акцентная";
        render(
            <SummarySection
                items={[
                    { label: MUTED, value: "1", marker: "muted" },
                    { label: ACCENT, value: "2", marker: "accent" },
                    { label: "Без маркера", value: "3" },
                ]}
            />,
        );

        // The marker is the empty span rendered inside the label's Text node.
        const markerOf = (label: string): Element | null =>
            screen.getByText(label).querySelector("span");

        expect(markerOf(MUTED)).not.toBeNull();
        expect(markerOf(ACCENT)).not.toBeNull();
        expect(markerOf("Без маркера")).toBeNull();
        expect(markerOf(MUTED)?.className).not.toBe(
            markerOf(ACCENT)?.className,
        );
    });
});
