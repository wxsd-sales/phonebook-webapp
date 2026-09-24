import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

/**
 * Flat ESLint config. Each surface (Node scripts, browser apps, the RoomOS
 * macro, and Jest tests) gets the right globals so `no-undef` is accurate.
 */
export default [
  {
    ignores: ["node_modules/**", "assets/**", "_site/**", "package-lock.json"],
  },
  js.configs.recommended,
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["wizard/**/*.js", "webapp/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
  {
    files: ["macros/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      // RoomOS macro runtime globals.
      globals: { ...globals.browser, xapi: "readonly" },
    },
  },
  {
    files: ["__tests__/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  prettier,
];
