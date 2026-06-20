import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
    plugins: [react()],
    root: ".",
    resolve: {
        alias: {
            "@app": resolve("./src/app"),
            "@core": resolve("./src/core"),
            "@layer-tools": resolve("./src/layer-tools"),
            "@map-tools": resolve("./src/map-tools"),
            "@modules": resolve("./src/modules"),
            "@widgets": resolve("./src/widgets"),
        },
    },
    build: {
        outDir: "build",
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
        include: ["src/**/*.test.ts"],
    },
});
