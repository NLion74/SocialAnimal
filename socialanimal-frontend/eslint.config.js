// eslint.config.js
import parser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
    // Top-level ignores
    {
        ignores: [".next/", "node_modules/"], // ✅ must be at top level
    },

    // Main rules
    {
        files: ["**/*.{js,jsx,ts,tsx}"],
        languageOptions: {
            parser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_" },
            ],
            semi: ["error", "always"],
            quotes: ["error", "double"],
        },
    },
];
