import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const [mode = "development", file = mode === "build" ? ".env.build" : ".env"] =
	process.argv.slice(2);

const composeFiles = {
	development: "dev-docker-compose.yml",
	build: "build-docker-compose.yml",
	production: "docker-compose.yml",
	legacy: "legacy-docker-compose.yml",
};

if (!Object.hasOwn(composeFiles, mode)) {
	console.error(
		"Usage: node scripts/validate-compose.mjs development|build|production|legacy [env-file]",
	);

	process.exit(1);
}

let config;

try {
	config = JSON.parse(
		execFileSync(
			"docker",
			[
				"compose",
				"--env-file",
				resolve(file),
				"-f",
				composeFiles[mode],
				"config",
				"--format",
				"json",
			],
			{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		),
	);
} catch {
	console.error(
		"Compose configuration could not be resolved. Check the env file and required variables: DATABASE_URL, JWT_SECRET, CREDENTIAL_ENCRYPTION_KEY, PUBLIC_URL, POSTGRES_PASSWORD and (for production) SOCIALANIMAL_VERSION.",
	);

	process.exit(1);
}

const problems = [];

const check = (condition, message) => {
	if (!condition) problems.push(message);
};

const { backend, frontend, db, setup } = config.services;

const env = backend.environment;

const parseUrl = (value) => {
	try {
		return new URL(value);
	} catch {
		return null;
	}
};

const database = parseUrl(env.DATABASE_URL);

const publicUrl = parseUrl(env.PUBLIC_URL);

const development = mode === "development";

check(
	/^[a-fA-F0-9]{64}$/.test(env.CREDENTIAL_ENCRYPTION_KEY || ""),
	"CREDENTIAL_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.",
);

check(
	typeof env.JWT_SECRET === "string" &&
		env.JWT_SECRET.length > 0 &&
		(development ||
			(env.JWT_SECRET.length >= 16 &&
				!/replace|change.?me/i.test(env.JWT_SECRET))),
	"JWT_SECRET must be a configured random secret of at least 16 characters.",
);

check(
	database && ["postgresql:", "postgres:"].includes(database.protocol),
	"DATABASE_URL must be a PostgreSQL URL.",
);

check(
	database &&
		!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
	"DATABASE_URL must address PostgreSQL outside the backend container (normally host db).",
);

if (database?.hostname === "db") {
	check(
		!database.port || database.port === "5432",
		"DATABASE_URL must use internal port 5432 for the Compose database.",
	);

	check(
		decodeURIComponent(database.username) ===
			db.environment.POSTGRES_USER &&
			decodeURIComponent(database.password) ===
				db.environment.POSTGRES_PASSWORD &&
			decodeURIComponent(database.pathname.slice(1)) ===
				db.environment.POSTGRES_DB,
		"DATABASE_URL credentials and database name must match POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB.",
	);
}

check(
	publicUrl &&
		["http:", "https:"].includes(publicUrl.protocol) &&
		publicUrl.pathname === "/" &&
		!publicUrl.search &&
		!publicUrl.hash,
	"PUBLIC_URL must be the public HTTP(S) origin, including the published port when needed.",
);

if (env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET) {
	check(
		env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
		"Configure both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or leave both blank.",
	);

	check(
		publicUrl &&
			env.GOOGLE_REDIRECT_URI ===
				`${publicUrl.origin}/api/v1/connections/google/callback`,
		"GOOGLE_REDIRECT_URI must use PUBLIC_URL and /api/v1/connections/google/callback.",
	);
}

for (const [key, minimum, maximum] of [
	["MIN_SYNC_INTERVAL_MINUTES", 1, 525600],
	["SYNC_CONCURRENCY", 1, 16],
]) {
	const value = Number(env[key]);

	check(
		Number.isInteger(value) && value >= minimum && value <= maximum,
		`${key} must be an integer from ${minimum} to ${maximum}.`,
	);
}

check(
	env.NODE_ENV === (development ? "development" : "production") &&
		frontend.environment.NODE_ENV === env.NODE_ENV,
	"Frontend and backend must run in the mode selected by the Compose file.",
);

check(
	String(env.PORT) === "4000" && String(frontend.environment.PORT) === "3000",
	"Internal application ports must remain 4000 and 3000.",
);

check(
	[
		"JWT_SECRET",
		"DATABASE_URL",
		"CREDENTIAL_ENCRYPTION_KEY",
		"GOOGLE_CLIENT_SECRET",
	].every((key) => !Object.hasOwn(frontend.environment, key)),
	"Frontend containers must not receive backend credentials.",
);

check(
	Object.values(config.services).every((service) => !service.container_name),
	"Container names must be scoped by the Compose project.",
);

if (!development) {
	check(
		setup?.image === backend.image,
		"Database setup and API must use the same backend image.",
	);

	check(
		backend.depends_on?.setup?.condition ===
			"service_completed_successfully",
		"API startup must wait for database setup to complete.",
	);

	check(
		!backend.ports?.length && !db.ports?.length,
		"Production modes must expose only the frontend.",
	);

	check(
		Object.values(config.services).every(
			(service) =>
				!(service.volumes || []).some(
					(volume) => volume.type === "bind",
				),
		),
		"Production modes must not bind-mount source code.",
	);

	check(
		mode === "build"
			? !!backend.build && !!frontend.build
			: !backend.build && !frontend.build && !setup.build,
		"Only build Compose should build application images.",
	);
}

if (problems.length) {
	console.error(problems.map((message) => `- ${message}`).join("\n"));
	process.exit(1);
}

console.log(
	`${mode}: Compose configuration and environment checks passed (secret values withheld).`,
);
