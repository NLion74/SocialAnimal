import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backend = fileURLToPath(new URL("../../../", import.meta.url));

const fixture = fileURLToPath(new URL("runtime-fixture.cjs", import.meta.url));

for (const [mode, module, options] of [
	[
		"development",
		"src/modules/integrations/adapters/window.ts",
		["--import", "tsx"],
	],
	["production", "dist/modules/integrations/adapters/window.js", []],
]) {
	execFileSync(process.execPath, [...options, fixture, module], {
		cwd: backend,
		stdio: "pipe",
		timeout: 25000,
	});

	console.log(
		`${mode}: isolated calendar parsing and recurrence checks passed`,
	);
}
