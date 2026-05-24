import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";

export default [
    // Base ESLint recommended config
    eslint.configs.recommended,

    // TypeScript configuration
    {
        files: ["**/*.ts", "**/*.tsx", "vite.config.ts"],
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
                module: "readonly",
                require: "readonly",
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
            "@typescript-eslint/no-explicit-any": "warn",
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

    // Project-specific rules aligned with AGENT.md
    {
        rules: {
            // MobX compatibility
            "no-underscore-dangle": [
                "error",
                {
                    allowAfterThis: true,
                    allow: [
                        "_widgets",
                        "_invokeInitialize",
                        "_invokeDestroy",
                        "_bbox",
                        "_id",
                    ],
                },
            ],

            // Architecture rules compliance
            "import/no-relative-parent-imports": "off", // Handled by TypeScript path aliases

            // Code quality
            complexity: ["error", 10],
            "max-depth": ["error", 4],
            "max-params": ["error", 4],
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
        ],
    },
];
