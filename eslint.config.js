import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", ".svelte-kit/**", "dist/**", "coverage/**", "postgres-data/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
