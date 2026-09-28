import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage", ".pytest_cache"]),

  // 🟦 ---------------------------------------------
  // CONFIGURAÇÃO PARA TAILWIND (CommonJS)
  // -----------------------------------------------
  {
    files: ["tailwind.config.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script", // 🟢 Usa module.exports
      globals: {
        ...globals.node, // 🟢 Libera module, require, etc
      },
    },
  },

  // 🟧 ---------------------------------------------
  // CONFIGURAÇÃO PARA VITE (ESM)
  // -----------------------------------------------
  {
    files: ["vite.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module", // 🟢 Vite.config usa import/export
      globals: {
        ...globals.node,
      },
    },
  },

  // 🟩 ---------------------------------------------
  // FRONTEND (React)
  // -----------------------------------------------
  {
    files: ["**/*.{js,jsx}"],

    // evitar que regras frontend rodem nos configs Node
    ignores: ["tailwind.config.js", "vite.config.js"],

    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],

    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
      },
    },

    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
]);
