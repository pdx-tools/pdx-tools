import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHookPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // https://typescript-eslint.io/rules/no-unused-vars/
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
    ...reactPlugin.configs.flat.recommended,
    languageOptions: {
      ...reactPlugin.configs.flat.recommended.languageOptions,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // https://github.com/yannickcr/eslint-plugin-react/issues/894#issuecomment-613789396
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
    },
  },
  reactPlugin.configs.flat["jsx-runtime"],
  {
    plugins: {
      "react-hooks": reactHookPlugin,
    },
    rules: {
      ...reactHookPlugin.configs.recommended.rules,
    },
  },
  {
    ignores: [
      "**/public/assets/**",
      "**/node_modules/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/wasm/wasm_app*",
    ],
  },
);
