import github from "eslint-plugin-github";

export default [
	github.getFlatConfigs().browser,
	github.getFlatConfigs().recommended,
	github.getFlatConfigs().react,
	...github.getFlatConfigs().typescript,
	{
		files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
		ignores: ["eslint.config.mjs"],
		settings: {
			// resolves relative ".js" imports (NodeNext convention) back to their ".ts" source files
			"import/resolver": {
				typescript: true,
			},
		},
		rules: {
			"github/array-foreach": "error",
			"github/async-preventdefault": "warn",
			"github/no-then": "error",
			"github/no-blur": "error",
		},
	},
];
