import js from "@eslint/js";
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
		rules: { "@typescript-eslint/no-explicit-any": "off" },
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
