import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
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

test("Compose volumes are isolated across modes and projects", (context) => {
	const root = mkdtempSync(join(tmpdir(), "socialanimal-volume-test-"));
	context.after(() => rmSync(root, { recursive: true, force: true }));
	let env = readFileSync(
		new URL("../../example.env", import.meta.url),
		"utf8",
	);
	for (const [key, value] of Object.entries({
		SOCIALANIMAL_VERSION: "volume-test",
		POSTGRES_PASSWORD: "fixture-only-password",
		JWT_SECRET: "fixture-only-authentication-secret",
		CREDENTIAL_ENCRYPTION_KEY: "ab".repeat(32),
	}))
		env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
	for (const file of [".env", ".env.build", ".env.dev"])
		writeFileSync(join(root, file), env, { mode: 0o600 });
	const names = new Set();
	for (const [file, prefix, envFile] of [
		["docker-compose.yml", "release", ".env"],
		["build-docker-compose.yml", "build", ".env.build"],
		["dev-docker-compose.yml", "dev", ".env.dev"],
		["legacy-docker-compose.yml", "legacy", ".env"],
	]) {
		copyFileSync(
			new URL(`../../${file}`, import.meta.url),
			join(root, file),
		);
		for (const project of ["volume-test-one", "volume-test-two"]) {
			const result = spawnSync(
				"docker",
				[
					"compose",
					"--env-file",
					envFile,
					"-f",
					file,
					"-p",
					project,
					"config",
					"--format",
					"json",
				],
				{ cwd: root, encoding: "utf8" },
			);
			assert.equal(result.status, 0, `Could not resolve ${file}`);
			const config = JSON.parse(result.stdout);
			const mount = config.services.db.volumes.find(
				(entry) => entry.target === "/var/lib/postgresql/data",
			);
			assert.equal(mount.type, "volume");
			assert.equal(mount.source, `${prefix}_postgres_data`);
			for (const [key, volume] of Object.entries(config.volumes)) {
				assert.ok(key.startsWith(`${prefix}_`));
				assert.equal(volume.name, `${project}_${key}`);
				assert.equal(volume.external, undefined);
				assert.equal(volume.driver_opts, undefined);
				assert.ok(
					!names.has(volume.name),
					"Modes/projects must not share volume names",
				);
				names.add(volume.name);
			}
		}
	}
});

test("storage migration refuses an existing volume before stopping services", (context) => {
	const { root, env } = fixture(context);
	const script = join(root, "scripts/migrate-compose-storage.mjs");
	copyFileSync(
		new URL("../../scripts/migrate-compose-storage.mjs", import.meta.url),
		script,
	);
	const calls = join(root, "calls.jsonl");
	writeFileSync(
		join(root, "bin/docker"),
		`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS_FILE, JSON.stringify(args) + "\\n");
if (args[0] === "compose" && args.includes("config")) {
  process.stdout.write(JSON.stringify({name:"test", volumes:{dev_postgres_data:{name:"test_dev_postgres_data"}}, services:{db:{volumes:[{type:"volume",source:"dev_postgres_data",target:"/var/lib/postgresql/data"}]}}}));
} else if (args[0] === "volume" && args[1] === "ls") {
  process.stdout.write("test_dev_postgres_data\\n");
} else process.exit(99);
`,
		{ mode: 0o755 },
	);
	const result = spawnSync(process.execPath, [script, "development"], {
		env: { ...env, CALLS_FILE: calls },
		encoding: "utf8",
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /already exists; refusing to overwrite/);
	const commands = readFileSync(calls, "utf8")
		.trim()
		.split("\n")
		.map(JSON.parse);
	assert.equal(commands.length, 2);
	assert.ok(
		commands.every(
			(args) =>
				!args.includes("stop") &&
				!args.includes("run") &&
				!args.includes("create"),
		),
	);
});
