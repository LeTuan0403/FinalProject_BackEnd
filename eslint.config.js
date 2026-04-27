const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest, // Nếu bạn có dùng test
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off", // Backend thường dùng console.log để debug
      "no-undef": "error",
    },
  },
];
