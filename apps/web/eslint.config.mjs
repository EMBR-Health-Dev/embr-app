// @ts-check
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next only ships an eslintrc-style ("legacy") config, so
// FlatCompat is the documented way to pull it into flat config — this
// is the same pattern create-next-app itself scaffolds for Next 15.
// Without this file, `next lint` silently fell back to a bare config
// with no react-hooks/exhaustive-deps, no jsx-a11y, no
// next/no-img-element, etc., while still reporting "no errors."
//
// Deliberately NOT spreading the root eslint.config.js here (unlike
// every other package) — its `...tseslint.configs.recommended` block
// registers the "@typescript-eslint" plugin from the `typescript-eslint`
// package directly, and `next/typescript` below registers its own
// (pnpm-resolved, not always byte-identical) instance under the same
// plugin name. Flat config throws "Cannot redefine plugin" when that
// collision happens — reconstructing the root config's other pieces
// by hand here avoids it while keeping the same effective rules.
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  prettierConfig,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
