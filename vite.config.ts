import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
    plugins: [react()],
    root: ".",
    resolve: {
        alias: {
            "@core": resolve("./src/core"),
            "@layer-tools": resolve("./src/layer-tools"),
            "@map-tools": resolve("./src/map-tools"),
            "@modules": resolve("./src/modules"),
            "@widgets": resolve("./src/widgets"),
        },
    },
    build: {
        outDir: "build",
        // Hidden maps: built for offline stack decoding, never referenced
        // from the shipped JS — whatever serves build/ must not publish them.
        sourcemap: "hidden",
        rollupOptions: {
            output: {
                // One 2.65 MB blob cache-invalidated on every app change;
                // split by dependency shelf-life instead — the heavy map
                // libraries move far rarer than the app code.
                manualChunks(id: string): string | undefined {
                    if (!id.includes("node_modules")) return undefined;
                    if (
                        /[\\/]node_modules[\\/]react(-dom)?[\\/]/.test(id) ||
                        /[\\/]node_modules[\\/]scheduler[\\/]/.test(id)
                    ) {
                        return "react";
                    }
                    if (
                        id.includes("@deck.gl") ||
                        id.includes("@luma.gl") ||
                        id.includes("loaders.gl")
                    ) {
                        return "deck";
                    }
                    if (id.includes("maplibre-gl")) return "maplibre";
                    if (id.includes("@turf") || id.includes("proj4")) {
                        return "geo";
                    }
                    return "vendor";
                },
            },
        },
    },
    server: {
        port: 3000,
        host: true,
    },
    preview: {
        port: 24678,
        host: true,
    },
    test: {
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
