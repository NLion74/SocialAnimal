import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [mode, project] = process.argv.slice(2);
const modes = {
	production: ["docker-compose.yml", ".env", "release"],
	build: ["build-docker-compose.yml", ".env.build", "build"],
	development: ["dev-docker-compose.yml", ".env.dev", "dev"],
	legacy: ["legacy-docker-compose.yml", ".env", "legacy"],
};

function docker(args, message) {
	const result = spawnSync("docker", args, {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
	});
	// Docker/Compose diagnostics may contain environment values. Keep them private.
	if (result.error || result.status !== 0) throw new Error(message);
	return result.stdout.trim();
}

try {
	if (!Object.hasOwn(modes, mode) || process.argv.length > 4)
		throw new Error(
			"Usage: node scripts/migrate-compose-storage.mjs production|build|development|legacy [compose-project]",
		);
	const [file, env, prefix] = modes[mode];
	const compose = ["compose", "--env-file", env, "-f", file];
	if (project) compose.push("-p", project);
	const config = JSON.parse(
		docker(
			[...compose, "config", "--format", "json"],
			"Unable to resolve Compose configuration.",
		),
	);
	const key = `${prefix}_postgres_data`;
	const target = config.volumes?.[key]?.name;
	const mount = config.services.db.volumes?.find(
		(entry) => entry.target === "/var/lib/postgresql/data",
	);
	if (
		mount?.type !== "volume" ||
		mount.source !== key ||
		target !== `${config.name}_${key}`
	)
		throw new Error(
			"Expected a database volume scoped by deployment mode and Compose project.",
		);
	const source = resolve(root, "docker_data", prefix, "postgres");
	const volumes = docker(
		["volume", "ls", "--format", "{{.Name}}"],
		"Unable to inspect Docker volumes.",
	).split("\n");
	if (volumes.includes(target))
		throw new Error(
			`Destination volume ${target} already exists; refusing to overwrite it.`,
		);
	const ids = docker(
		[
			"ps",
			"-aq",
			"--filter",
			`label=com.docker.compose.project=${config.name}`,
			"--filter",
			"label=com.docker.compose.service=db",
		],
		"Unable to find the database container.",
	)
		.split("\n")
		.filter(Boolean);
	const containers = ids.length
		? JSON.parse(
				docker(
					["inspect", ...ids],
					"Unable to inspect the database container.",
				),
			)
		: [];
	for (const container of containers) {
		const existing = container.Mounts.find(
			(entry) => entry.Destination === "/var/lib/postgresql/data",
		);
		if (existing?.Type !== "bind" || existing.Source !== source)
			throw new Error(
				"This Compose project points to a different database; refusing to stop or copy it.",
			);
	}
	const sourceMount = [
		"--mount",
		`type=bind,src=${source},dst=/source,readonly`,
	];
	docker(
		[
			"run",
			"--rm",
			"--network",
			"none",
			...sourceMount,
			"postgres:16",
			"sh",
			"-ec",
			'test "$(cat /source/PG_VERSION)" = 16',
		],
		"No PostgreSQL 16 database found in the old directory. Fresh installations need no storage migration.",
	);
	console.log(
		`Stopping ${config.name} before copying ${prefix} PostgreSQL data.`,
	);
	docker(
		[...compose, "stop"],
		"Unable to stop the stack; no data was copied.",
	);
	docker(
		[
			"run",
			"--rm",
			"--network",
			"none",
			"-e",
			"LC_ALL=C",
			...sourceMount,
			"postgres:16",
			"sh",
			"-ec",
			`
pg_controldata /source | grep -Eq '^Database cluster state: +shut down$'
test ! -e /source/postmaster.pid
test -z "$(find /source -type l -print -quit)"
`,
		],
		"The source is not cleanly stopped or uses external symlinks. No data was copied; leave it stopped and inspect the cluster.",
	);
	docker(
		[
			"volume",
			"create",
			"--label",
			`com.docker.compose.project=${config.name}`,
			"--label",
			`com.docker.compose.volume=${key}`,
			target,
		],
		"Unable to create the destination volume.",
	);
	docker(
		[
			"run",
			"--rm",
			"--network",
			"none",
			...sourceMount,
			"--mount",
			`type=volume,src=${target},dst=/target`,
			"postgres:16",
			"sh",
			"-ec",
			`
test -z "$(ls -A /target)"
cp -a /source/. /target/
diff -qr /source /target
`,
		],
		`Copy or verification failed. The original directory is intact; do not start the stack using ${target} until the copy is verified. The destination is retained for inspection.`,
	);
	console.log(
		`Verified file contents in ${target}. Original directory retained: docker_data/${prefix}/postgres.`,
	);
	console.log(
		"The stack remains stopped. Start it with your usual Compose command; keep the same environment and encryption key.",
	);
} catch (error) {
	console.error(
		error instanceof SyntaxError
			? "Could not read Docker configuration."
			: error.message,
	);
	process.exitCode = 1;
}
