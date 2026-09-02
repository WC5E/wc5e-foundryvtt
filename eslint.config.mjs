import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(
	{
		ignores: ["node_modules/**", "module/packs/**", "src/generated/**", "coverage/**", "dist/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.es2024,
			},
		},
		rules: {
			"prefer-const": "warn",
			"prefer-arrow-callback": "warn",
			curly: ["warn", "all"],
			"keyword-spacing": ["warn", { before: true, after: true }],
			"space-before-blocks": ["warn", "always"],
			"block-spacing": ["warn", "always"],
			"brace-style": ["warn", "1tbs", { allowSingleLine: false }],
			"no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		rules: {
			"func-style": ["warn", "declaration", { allowArrowFunctions: true }],
		},
	},
	{
		files: ["module/scripts/**/*.mjs", "module/scripts/**/*.js"],
		languageOptions: {
			globals: {
				...globals.node,
				foundry: "readonly",
				game: "readonly",
				ui: "readonly",
				Hooks: "readonly",
				Handlebars: "readonly",
				fromUuid: "readonly",
			},
		},
		rules: {
			"no-undef": "off",
			"no-control-regex": "off",
			"no-irregular-whitespace": "off",
			"preserve-caught-error": "off",
		},
	},
);
