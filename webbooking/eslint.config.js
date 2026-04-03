const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.es2021
            }
        },
        rules: {
            // Strict Rules
            "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off", // Backend apps rely on console for logs
            "eqeqeq": ["error", "always"], // Enforce ===
            "curly": ["error", "all"], // Enforce curly braces
            "no-var": "error", // Disallow var
            "prefer-const": "error", // Enforce const
            "no-multiple-empty-lines": ["error", { "max": 1 }],
            "semi": ["error", "always"], // Enforce semicolons

            // Complexity/Maintainability
            "complexity": ["warn", 15],
            "max-depth": ["warn", 4],
            "max-lines-per-function": ["warn", { "max": 100, "skipBlankLines": true, "skipComments": true }]
        }
    },
    {
        ignores: ["node_modules/", "dist/", "public/"]
    }
];
