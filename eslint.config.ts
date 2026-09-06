import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

// injected by Foundry at runtime, not importable
const foundryGlobals = {
	Handlebars: "readonly",
	Hooks: "readonly",
	foundry: "readonly",
	fromUuid: "readonly",
	game: "readonly",
	ui: "readonly",
} as const;

export default defineConfig([
	{
		files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
		plugins: { js },
		extends: ["js/recommended"],
	},
	tseslint.configs.recommended,
	{
		plugins: { "@stylistic": stylistic },
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@stylistic/arrow-parens": ["error", "always"],
			"@stylistic/comma-dangle": ["error", "always-multiline"],
			"@stylistic/indent": ["error", "tab"],
			"@stylistic/quotes": ["error", "double", { avoidEscape: true }],
			"@stylistic/semi": ["error", "always"],
		},
	},
	{
		files: ["build/**", "tests/**", "*.ts"],
		languageOptions: { globals: globals.node },
	},
	{
		files: ["module/scripts/**"],
		languageOptions: { globals: { ...globals.browser, ...foundryGlobals } },
	},
]);
