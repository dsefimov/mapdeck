import { copyFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import pkg from "./package.json";

/**
 * Library build: prebuilt ESM, one mapdeck.css, and declarations with
 * aliases rewritten. The reference host's toolchain (webpack 5 +
 * ts-loader) does not compile TS or CSS Modules from node_modules, so
 * everything arrives ready to import; every runtime dependency stays
 * external — npm and the host's shared-singleton config deduplicate
 * versions. Demo-only code (main.tsx and its config readers) is not
 * part of the package surface and is excluded from declarations.
 */

const DEMO_ONLY_SOURCES = [
    "src/app/main.tsx",
    "src/app/appConfig.ts",
    "src/app/runtimeConfig.ts",
    "src/app/globalErrorHandlers.ts",
];

/**
 * The one asset shipped as a file: the wasm binary the host serves over
 * HTTP (runtime URL, never bundler-imported). A copy in dist keeps its
 * version locked to the library's laz-perf dependency. Everything else
 * is inlined (icons, worker), so the worker-sourcemap leak into
 * dist/assets is removed — the package emits no asset files.
 */
function copyLazPerfWasm(): Plugin {
    return {
        name: "copy-laz-perf-wasm",
        closeBundle() {
            copyFileSync(
                resolve(import.meta.dirname, "node_modules/laz-perf/lib/laz-perf.wasm"),
                resolve(import.meta.dirname, "dist/laz-perf.wasm"),
            );
            rmSync(resolve(import.meta.dirname, "dist", "assets"), {
                recursive: true,
                force: true,
            });
        },
    };
}

/**
 * Runtime dependencies stay external — the host installs them, and npm
 * or its shared-singleton config deduplicates versions. The list comes
 * from the manifest; internal aliases (@core/… and friends) are not
 * module ids here — the bundler's external check runs before alias
 * resolution, so a "everything bare is external" rule would ship a
 * package of stubs.
 */
const EXTERNAL_MODULES = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
];

function isExternalModule(id: string): boolean {
    // Vendor stylesheets (maplibre, react-grid-layout, react-resizable)
    // join the single mapdeck.css: the reference host's pipeline does
    // not process css from node_modules, so the package must ship it.
    if (id.endsWith(".css")) {
        return false;
    }
    return EXTERNAL_MODULES.some(
        (name) => id === name || id.startsWith(`${name}/`),
    );
}

export default defineConfig({
    plugins: [
        react(),
        dts({
            entryRoot: "src",
            include: [
                "src/app/**/*",
                "src/core/**/*",
                "src/modules/**/*",
                "src/widgets/**/*",
                "src/layer-tools/**/*",
                "src/map-tools/**/*",
            ],
            exclude: [...DEMO_ONLY_SOURCES, "**/*.test.ts", "**/*.test.tsx"],
        }),
        copyLazPerfWasm(),
    ],
    resolve: {
        alias: {
            "@core": resolve(import.meta.dirname, "src/core"),
            "@layer-tools": resolve(import.meta.dirname, "src/layer-tools"),
            "@map-tools": resolve(import.meta.dirname, "src/map-tools"),
            "@modules": resolve(import.meta.dirname, "src/modules"),
            "@widgets": resolve(import.meta.dirname, "src/widgets"),
        },
    },
    // The demo data in public/ is dogfood-only; the package ships the
    // wasm copy explicitly instead.
    publicDir: false,
    build: {
        outDir: "dist",
        sourcemap: true,
        minify: false,
        lib: {
            entry: {
                mapdeck: resolve(import.meta.dirname, "src/app/index.ts"),
                contracts: resolve(import.meta.dirname, "src/app/contracts.ts"),
                ui: resolve(import.meta.dirname, "src/app/ui.ts"),
                utils: resolve(import.meta.dirname, "src/app/utils.ts"),
            },
            formats: ["es"],
        },
        cssCodeSplit: false,
        // Icons (the only bundled assets) are ~4.4 KB each — everything
        // inlines as data URLs; the package emits no asset files.
        assetsInlineLimit: 16 * 1024,
        rollupOptions: {
            external: isExternalModule,
            output: {
                entryFileNames: "[name].js",
                assetFileNames: "mapdeck.[ext]",
            },
        },
    },
});
