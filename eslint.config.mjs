import typescriptEslint from "typescript-eslint";

export default [{
    // [L2] Don't lint vendored third-party code (e.g. pwa/vendor/qrcode.js) — not ours to fix.
    ignores: ["**/vendor/**"],
}, {
    files: ["**/*.ts"],
}, {
    plugins: {
        "@typescript-eslint": typescriptEslint.plugin,
    },

    languageOptions: {
        parser: typescriptEslint.parser,
        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }],

        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",
        complexity: ["warn", 10],
    },
}];