// @ts-check
import js from "@eslint/js";
import expoConfig from "eslint-config-expo/flat.js";
import prettierConfig from "eslint-config-prettier";

// Deliberately NOT spreading the root eslint.config.js here, same
// reasoning as apps/web/eslint.config.mjs and apps/admin/eslint.config.mjs:
// eslint-config-expo registers its own "@typescript-eslint" plugin
// instance directly, and root's `...tseslint.configs.recommended` would
// register a second, not-necessarily-identical one under the same
// name — flat config throws "Cannot redefine plugin" on that collision.
// Reconstructing the root config's other pieces (ignores,
// js.configs.recommended, prettier compat, the repo's custom rules)
// here instead avoids it while keeping the same effective rules.
//
// Unlike apps/web/apps/admin (which need FlatCompat to pull in
// eslint-config-next's eslintrc-style config), eslint-config-expo
// ships flat config natively — no compat shim needed here. The
// explicit "/flat.js" path (not just "/flat") still matters: the
// package ships both a flat.js file and a same-named flat/ directory
// at its root, and Node's ESM resolver finds the directory first
// without the extension.

export default [
  {
    ignores: ["**/dist/**", "**/.expo/**", "**/node_modules/**", "**/ios/**", "**/android/**"],
  },
  js.configs.recommended,
  ...expoConfig,
  prettierConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
