import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import jsdoc from "eslint-plugin-jsdoc";

export default [
    // Base ESLint recommended config
    eslint.configs.recommended,

    // TypeScript configuration
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: {
                    jsx: true,
                },
                project: "./tsconfig.json",
            },
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                __dirname: "readonly",
                process: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                fetch: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            ...tseslint.configs["recommended"].rules,
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
        },
    },

    // React configuration
    {
        files: ["**/*.tsx", "**/*.jsx"],
        plugins: {
            react: reactPlugin,
            "react-hooks": reactHooks,
        },
        settings: {
            react: {
                version: "detect",
            },
        },
        rules: {
            ...reactPlugin.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            "react/prop-types": "off",
            "react/react-in-jsx-scope": "off",
            "react/jsx-uses-react": "off",
        },
    },

    // SonarJS configuration
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: {
            sonarjs,
        },
        rules: {
            ...sonarjs.configs.recommended.rules,
            "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
            "sonarjs/no-identical-functions": "error",
            "sonarjs/cognitive-complexity": ["error", 15],
        },
    },

    // Project-specific rules aligned with AGENTS.md
    {
        rules: {
            // MobX compatibility
            "no-underscore-dangle": [
                "error",
                {
                    allowAfterThis: true,
                    allow: ["_bbox"],
                },
            ],

            // Code quality
            complexity: ["error", 10],
            "max-depth": ["error", 4],
            "max-params": ["error", 4],
        },
    },

    {
        files: [
            "src/widgets/**/*.ts",
            "src/widgets/**/*.tsx",
            "src/map-tools/**/*.ts",
            "src/map-tools/**/*.tsx",
            "src/layer-tools/**/*.ts",
            "src/layer-tools/**/*.tsx",
            "src/modules/**/*.ts",
            "src/modules/**/*.tsx",
        ],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/app/**"],
                            message:
                                "Extensions must not import app — the composition root is app-owned.",
                        },
                    ],
                },
            ],
        },
    },

    // Cross-kind extension imports are forbidden (AGENTS.md): widgets,
    // layer-tools, map-tools and modules interact through @core contracts
    // only. One override per kind bans its three siblings.
    ...[
        ["src/widgets/**", ["@layer-tools/*", "@map-tools/*", "@modules/*"]],
        ["src/layer-tools/**", ["@widgets/*", "@map-tools/*", "@modules/*"]],
        ["src/map-tools/**", ["@widgets/*", "@layer-tools/*", "@modules/*"]],
        ["src/modules/**", ["@widgets/*", "@layer-tools/*", "@map-tools/*"]],
    ].map(([files, group]) => ({
        files: [files],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group,
                            message:
                                "Extensions must not import each other — shared vocabulary belongs in @core/contracts.",
                        },
                    ],
                },
            ],
        },
    })),

    // === Core layer graph enforcement (AGENTS.md Dependency Graph) ===
    // lib imports nothing: no framework, no state library, no upper layer.
    {
        files: ["src/core/lib/**/*.ts", "src/core/lib/**/*.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "mobx",
                                "mobx-react-lite",
                                "react",
                                "react-dom",
                                "react-dom/*",
                                "react-grid-layout",
                                "react-grid-layout/*",
                                "maplibre-gl",
                                "@deck.gl/*",
                            ],
                            message:
                                "lib is framework-free: no React, MobX, map engines or grid libraries.",
                        },
                        {
                            group: [
                                "@core/common",
                                "@core/common/*",
                                "@core/contracts",
                                "@core/contracts/*",
                                "@core/domain",
                                "@core/domain/*",
                                "@core/ui",
                                "@core/ui/*",
                                "@core/shell",
                                "@core/shell/*",
                                "@core/store-registry",
                            ],
                            message:
                                "lib imports nothing upward — it is the bottom layer.",
                        },
                        {
                            group: [
                                "**/app/**",
                                "@widgets/*",
                                "@layer-tools/*",
                                "@map-tools/*",
                                "@modules/*",
                            ],
                            message:
                                "lib must not know the application or its extensions.",
                        },
                    ],
                },
            ],
        },
    },

    // ui is the generic kit: lib + React only — no stores, no domains.
    {
        files: ["src/core/ui/**/*.ts", "src/core/ui/**/*.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@core/common",
                                "@core/common/*",
                                "@core/domain",
                                "@core/domain/*",
                                "@core/contracts",
                                "@core/contracts/*",
                                "@core/shell",
                                "@core/shell/*",
                                "@core/store-registry",
                            ],
                            message:
                                "The ui kit imports lib only — inject stores and vocabulary through structural props.",
                        },
                        {
                            group: [
                                "**/app/**",
                                "@widgets/*",
                                "@layer-tools/*",
                                "@map-tools/*",
                                "@modules/*",
                            ],
                            message:
                                "The ui kit must not know the application or its extensions.",
                        },
                        {
                            group: ["mobx", "mobx-react-lite", "mobx-react-lite/*"],
                            message:
                                "Stores are not for the generic kit — the WidgetGrid precedent (AGENTS) is the only reactive consumer.",
                        },
                    ],
                },
            ],
        },
    },

    // The one sanctioned reactive kit consumer: the grid renders
    // store-driven layouts (WidgetGrid precedent, AGENTS dependency graph).
    {
        files: ["src/core/ui/composites/widget-grid/**/*.ts", "src/core/ui/composites/widget-grid/**/*.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@core/common",
                                "@core/common/*",
                                "@core/domain",
                                "@core/domain/*",
                                "@core/contracts",
                                "@core/contracts/*",
                                "@core/shell",
                                "@core/shell/*",
                                "@core/store-registry",
                            ],
                            message:
                                "The ui kit imports lib only — inject stores and vocabulary through structural props.",
                        },
                        {
                            group: [
                                "**/app/**",
                                "@widgets/*",
                                "@layer-tools/*",
                                "@map-tools/*",
                                "@modules/*",
                            ],
                            message:
                                "The ui kit must not know the application or its extensions.",
                        },
                    ],
                },
            ],
        },
    },

    // contracts is the kernel: lib plus external type contracts only.
    {
        files: ["src/core/contracts/**/*.ts", "src/core/contracts/**/*.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "mobx",
                                "mobx-react-lite",
                                "react-dom",
                                "react-grid-layout",
                                "react-grid-layout/*",
                            ],
                            message:
                                "contracts stay MobX-free and render-library-free.",
                        },
                        {
                            group: ["react"],
                            allowTypeImports: true,
                            message:
                                "contracts may reference React types only — no runtime React.",
                        },
                        {
                            group: [
                                "@core/common",
                                "@core/common/*",
                                "@core/domain",
                                "@core/domain/*",
                                "@core/ui",
                                "@core/ui/*",
                                "@core/shell",
                                "@core/shell/*",
                                "@core/store-registry",
                            ],
                            message:
                                "contracts names no layer above lib — the kernel is independent of stores and UI.",
                        },
                        {
                            group: [
                                "**/app/**",
                                "@widgets/*",
                                "@layer-tools/*",
                                "@map-tools/*",
                                "@modules/*",
                            ],
                            message:
                                "contracts is extension-neutral (ADR-0004).",
                        },
                    ],
                },
            ],
        },
    },

    // shell is the DI glue: contracts and the composition type only.
    {
        files: ["src/core/shell/**/*.ts", "src/core/shell/**/*.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@core/common",
                                "@core/common/*",
                                "@core/domain",
                                "@core/domain/*",
                                "@core/ui",
                                "@core/ui/*",
                            ],
                            message:
                                "shell reaches contracts and the StoreRegistry composition type only.",
                        },
                        {
                            group: [
                                "**/app/**",
                                "@widgets/*",
                                "@layer-tools/*",
                                "@map-tools/*",
                                "@modules/*",
                            ],
                            message:
                                "shell must not know the application or its extensions.",
                        },
                    ],
                },
            ],
        },
    },

    // common is technical: contracts + lib, no domains or UI.
    {
        files: ["src/core/common/**/*.ts", "src/core/common/**/*.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@core/domain",
                                "@core/domain/*",
                                "@core/ui",
                                "@core/ui/*",
                                "@core/shell",
                                "@core/shell/*",
                            ],
                            message:
                                "common subsystems stay technical — no domains, no UI kit.",
                        },
                        {
                            group: [
                                "**/app/**",
                                "@widgets/*",
                                "@layer-tools/*",
                                "@map-tools/*",
                                "@modules/*",
                            ],
                            message:
                                "common must not know the application or its extensions.",
                        },
                    ],
                },
            ],
        },
    },

    // domains know the kernel and the kit — never the app or extensions.
    {
        files: ["src/core/domain/**/*.ts", "src/core/domain/**/*.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "**/app/**",
                                "@widgets/*",
                                "@layer-tools/*",
                                "@map-tools/*",
                                "@modules/*",
                            ],
                            message:
                                "The kernel does not know the application or its extensions (AGENTS.md).",
                        },
                        {
                            group: ["@core/domain/*"],
                            message:
                                "Intra-domain imports are relative; cross-domain calls go through contracts (AGENTS.md).",
                        },
                    ],
                },
            ],
        },
    },

    {
        files: [
            "src/core/contracts/**/*.ts",
            "src/core/domain/**/*.ts",
        ],
        plugins: {
            jsdoc,
        },
        rules: {
            "jsdoc/require-jsdoc": [
                "error",
                {
                    publicOnly: true,
                    contexts: [
                        "TSInterfaceDeclaration",
                        "TSTypeAliasDeclaration",
                    ],
                },
            ],
        },
    },

    // Ignore patterns
    {
        ignores: [
            "node_modules/",
            "dist/",
            "build/",
            "external/",
            "eslint.config.js",
            // Playwright specs live outside the typed-lint project (their
            // tsconfig is tests/tsconfig.json); Playwright runs them itself.
            "tests/",
        ],
    },
];
