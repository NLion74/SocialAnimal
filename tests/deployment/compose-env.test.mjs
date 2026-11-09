import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function fixture(context) {
	const root = mkdtempSync(join(tmpdir(), "socialanimal compose "));
	context.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "scripts"));
	mkdirSync(join(root, "bin"));
	writeFileSync(
		join(root, "bin/docker"),
		"#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
		{ mode: 0o755 },
	);
	for (const name of [".env", ".env.dev", ".env.build"])
		writeFileSync(join(root, name), "", { mode: 0o600 });
	return {
		root,
		env: {
			...process.env,
			PATH: `${join(root, "bin")}:${process.env.PATH}`,
		},
	};
}

test("validation rejects undefined substitutions without printing sensitive fragments", (context) => {
	const { root, env } = fixture(context);
	const script = join(root, "scripts/validate-compose.mjs");
	copyFileSync(
		new URL("../../scripts/validate-compose.mjs", import.meta.url),
		script,
	);
	writeFileSync(
		join(root, "bin/docker"),
		'#!/usr/bin/env node\nprocess.stdout.write("{}");\nprocess.stderr.write(\'The "private-secret-fragment" variable is not set. Defaulting to a blank string.\');\n',
		{ mode: 0o755 },
	);
	const result = spawnSync(process.execPath, [script, "development"], {
		env,
		encoding: "utf8",
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /undefined variable/);
	assert.doesNotMatch(result.stderr, /private-secret-fragment/);
});
