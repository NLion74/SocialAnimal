const path = require("node:path");

const boundaryRule = {
	meta: {
		type: "problem",
		schema: [],
		messages: {
			boundary:
				"Modules must use public index interfaces; core cannot import feature modules.",
			adapter:
				"Provider adapters cannot import persistence or application operations.",
		},
	},
	create(context) {
		const filename = context.filename;
		const sourceRoot = path.resolve(__dirname, "src");
		const current = path.relative(sourceRoot, filename).split(path.sep);

		return {
			ImportDeclaration(node) {
				const specifier = node.source.value;
				if (!specifier.startsWith(".")) return;

				const target = path
					.relative(
						sourceRoot,
						path.resolve(path.dirname(filename), specifier),
					)
					.split(path.sep);

				if (
					(current[0] === "core" && target[0] === "modules") ||
					(current[0] === "services" &&
						["core", "modules"].includes(target[0]))
				)
					context.report({ node, messageId: "boundary" });

				if (
					target[0] === "modules" &&
					(current[0] !== "modules" || current[1] !== target[1]) &&
					target.length > 2 &&
					target[2] !== "index"
				)
					context.report({ node, messageId: "boundary" });

				if (
					current.includes("adapters") &&
					!filename.endsWith(".test.ts") &&
					((target[0] === "core" && target[1] === "database") ||
						(target[0] === "modules" &&
							!target.includes("adapters")))
				)
					context.report({ node, messageId: "adapter" });
			},
		};
	},
};

module.exports = [
	{
		ignores: ["node_modules", "dist"],
		files: ["src/**/*.ts"],
		languageOptions: { parser: require("@typescript-eslint/parser") },
		plugins: {
			"@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
			architecture: { rules: { boundaries: boundaryRule } },
		},
		rules: {
			semi: ["error", "always"],
			quotes: ["error", "double"],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"architecture/boundaries": "error",
		},
	},
];
