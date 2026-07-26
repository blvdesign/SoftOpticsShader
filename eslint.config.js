import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "apps/*/src/**/*.{ts,tsx}",
      "examples/*/src/**/*.{ts,tsx}",
      "packages/*/src/**/*.{ts,tsx}"
    ],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: [
      "**/*.config.{js,mjs,cjs,ts}",
      "scripts/**/*.{js,mjs,cjs,ts}"
    ],
    languageOptions: {
      globals: globals.node
    }
  }
);
