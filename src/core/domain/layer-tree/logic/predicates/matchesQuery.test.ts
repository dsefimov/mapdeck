import { describe, expect, it } from "vitest";
import { matchesQuery } from "./matchesQuery";
import { layerNode, groupNode } from "../structure/__testFactories";

describe("matchesQuery", () => {
    it("matches when title contains query (case-insensitive)", () => {
        const predicate = matchesQuery("LAKES");
        const node = layerNode("1", { title: "Great lakes" });
        expect(predicate(node)).toBe(true);
    });

    it("matches when description contains query", () => {
        const predicate = matchesQuery("rivers");
        const node = layerNode("1", {
            title: "X",
            description: "Major rivers",
        });
        expect(predicate(node)).toBe(true);
    });

    it("returns false when neither title nor description matches", () => {
        const predicate = matchesQuery("xyz");
        const node = layerNode("1", { title: "abc", description: "def" });
        expect(predicate(node)).toBe(false);
    });

    it("matches partial substrings", () => {
        const predicate = matchesQuery("lake");
        const node = layerNode("1", { title: "Lakeside" });
        expect(predicate(node)).toBe(true);
    });

    it("matches everything when query is empty", () => {
        const predicate = matchesQuery("");
        const node = layerNode("1", { title: "Anything" });
        expect(predicate(node)).toBe(true);
    });

    it("handles special characters via .includes()", () => {
        const predicate = matchesQuery("(test)");
        const node = layerNode("1", { title: "Value (test) here" });
        expect(predicate(node)).toBe(true);
    });

    it("returns false when both title and description are empty", () => {
        const predicate = matchesQuery("x");
        const node = layerNode("1", { title: "", description: "" });
        expect(predicate(node)).toBe(false);
    });

    it("works with GroupNode as well", () => {
        const predicate = matchesQuery("folder");
        const node = groupNode("g1", [], { title: "My Folder" });
        expect(predicate(node)).toBe(true);
    });

    it("matches by report title of a layer", () => {
        const predicate = matchesQuery("quality");
        const node = layerNode("1", {
            title: "Orthophoto 2023",
            description: "",
            relatedObjects: [
                {
                    id: "rep-1",
                    type: "report",
                    title: "Quality Report",
                },
            ],
        });
        expect(predicate(node)).toBe(true);
    });

    it("matches by report title of a group", () => {
        const predicate = matchesQuery("coverage");
        const node = groupNode("g1", [], {
            title: "Collections",
            description: "",
            relatedObjects: [
                {
                    id: "rep-2",
                    type: "report",
                    title: "Coverage Report",
                },
            ],
        });
        expect(predicate(node)).toBe(true);
    });

    it("matches by report description when present", () => {
        const predicate = matchesQuery("validation");
        const node = layerNode("1", {
            title: "Layer",
            relatedObjects: [
                {
                    id: "rep-3",
                    type: "report",
                    title: "Report",
                    description: "Contains validation results",
                },
            ],
        });
        expect(predicate(node)).toBe(true);
    });

    it("ignores non-report related objects", () => {
        const predicate = matchesQuery("collection");
        const node = layerNode("1", {
            title: "Layer",
            description: "",
            relatedObjects: [
                {
                    id: "coll-1",
                    type: "collection",
                    title: "Aerial Collection",
                },
            ],
        });
        expect(predicate(node)).toBe(false);
    });

    it("does not match a node without matching report text", () => {
        const predicate = matchesQuery("unrelated");
        const node = layerNode("1", {
            title: "Layer",
            description: "",
            relatedObjects: [
                { id: "rep-4", type: "report", title: "Quality Report" },
            ],
        });
        expect(predicate(node)).toBe(false);
    });
});
