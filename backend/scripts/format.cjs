const fs = require("node:fs");

const path = require("node:path");

const cp = require("node:child_process");

const ts = require("typescript");

const prettier = require("prettier");

async function main() {
	const root = path.resolve(__dirname, "../..");

	const tracked = cp
		.execFileSync("git", ["diff", "--name-only", "-z"], { cwd: root })
		.toString()
		.split("\0");

	const fresh = cp
		.execFileSync(
			"git",
			["ls-files", "--others", "--exclude-standard", "-z"],
			{ cwd: root },
		)
		.toString()
		.split("\0");

	for (const file of new Set([...tracked, ...fresh])) {
		const absolute = path.join(root, file);

		if (
			!file ||
			!fs.existsSync(absolute) ||
			!fs.statSync(absolute).isFile() ||
			file.includes("tsbuildinfo") ||
			file.endsWith("lib/generated/client.ts") ||
			(file.includes("prisma/migrations/") &&
				!file.includes("20260929120000_rest_v1")) ||
			file.endsWith("next-env.d.ts")
		)
			continue;

		if (!/\.(tsx?|[cm]?js|json|css|md|ya?ml)$/.test(file)) continue;
		let text = fs.readFileSync(absolute, "utf8");

		if (/\.(tsx?|[cm]?js)$/.test(file)) {
			const source = ts.createSourceFile(
				file,
				text,
				ts.ScriptTarget.Latest,
				true,
				file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
			);

			const edits = [];

			function spaceStatements(statements, topLevel = false) {
				for (let i = 1; i < statements.length; i++) {
					const prev = statements[i - 1],
						next = statements[i];

					if (
						ts.isImportDeclaration(prev) &&
						ts.isImportDeclaration(next)
					)
						continue;

					const multiline = (node) =>
						text
							.slice(node.getStart(source), node.end)
							.includes("\n");

					if (!topLevel && !multiline(prev) && !multiline(next))
						continue;

					const gap = text.slice(prev.end, next.getStart(source));

					if (/^\s*$/.test(gap))
						edits.push([prev.end, next.getStart(source)]);
				}
			}

			spaceStatements(source.statements, true);

			function visit(node) {
				if (ts.isBlock(node)) spaceStatements(node.statements);
				ts.forEachChild(node, visit);
			}

			ts.forEachChild(source, visit);

			for (const [start, end] of edits.sort((a, b) => b[0] - a[0]))
				text = text.slice(0, start) + "\n\n" + text.slice(end);
		}

		const config = await prettier.resolveConfig(absolute);

		fs.writeFileSync(
			absolute,
			await prettier.format(text, { ...config, filepath: absolute }),
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
