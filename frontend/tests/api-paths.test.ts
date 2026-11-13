import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { expect, it } from "vitest";

it("application sources use v1 APIs except the explicit Google compatibility proxy", () => {
	const root = resolve(import.meta.dirname, "..");
	const violations: string[] = [];
	for (const dir of ["app", "features", "lib", "components"]) {
		for (const file of readdirSync(resolve(root, dir), {
			recursive: true,
			withFileTypes: true,
		})) {
			if (!file.isFile() || !/\.[cm]?[jt]sx?$/.test(file.name)) continue;
			const path = resolve(file.parentPath, file.name);
			const source = readFileSync(path, "utf8");
			for (const match of source.matchAll(
				/\/api\/(?!v1(?:\/|["'`]))[a-zA-Z][\w/-]*/g,
			)) {
				if (
					relative(root, path) ===
						"app/api/providers/google/callback/route.ts" &&
					match[0] === "/api/providers/google/callback"
				)
					continue;
				violations.push(`${relative(root, path)}: ${match[0]}`);
			}
		}
	}
	expect(violations).toEqual([]);
});
