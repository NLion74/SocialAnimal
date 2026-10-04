import Fastify, { LogController } from "fastify";
import { Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { loggingOptions, logRequests } from "../../src/core/http/logging";
import { errors, fail } from "../../src/core/http";
import { startRunner } from "../../src/core/jobs";

afterEach(() => vi.unstubAllEnvs());

function fixture(level = "info") {
	vi.stubEnv("LOG_LEVEL", level);
	const lines: string[] = [];

	const stream = new Writable({
		write(chunk, _encoding, callback) {
			lines.push(chunk.toString());
			callback();
		},
	});

	const app = Fastify({
		logger: { ...loggingOptions(), stream },
		logController: new LogController({ disableRequestLogging: true }),
		requestIdHeader: false,
	});

	logRequests(app);
	errors(app);

	return {
		app,
		lines,
		records: () =>
			lines.flatMap((line) =>
				line
					.trim()
					.split("\n")
					.map((entry) => JSON.parse(entry)),
			),
	};
}

it("logs useful request metadata without path tokens, query strings, headers, or bodies", async () => {
	const { app, lines, records } = fixture();

	app.post("/feeds/:token.ics", async (request, reply) => {
		request.log.info(
			{ req: request, res: reply, err: new Error("private-error") },
			"Safe serialization",
		);

		return { ok: true };
	});

	app.get("/api/v1/connections/google/callback", async () => ({ ok: true }));

	try {
		await app.inject({
			method: "POST",
			url: "/feeds/private-feed.ics?token=private-query",
			headers: {
				authorization: "Bearer private-bearer",
				cookie: "private-cookie",
				"x-request-id": "private-id",
			},
			payload: { password: "private-password" },
		});

		await app.inject(
			"/api/v1/connections/google/callback?code=private-code&state=private-state",
		);

		await app.inject("/unknown/private-path?token=private-token");

		expect(lines.join("")).not.toContain("private-");

		expect(records()).toContainEqual(
			expect.objectContaining({
				msg: "Request completed",
				route: "/feeds/:token.ics",
				method: "POST",
				statusCode: 200,
				reqId: expect.any(String),
				durationMs: expect.any(Number),
			}),
		);

		expect(records()).toContainEqual(
			expect.objectContaining({
				route: "unmatched",
				statusCode: 404,
				level: 40,
			}),
		);
	} finally {
		await app.close();
	}
});

it("logs safe provider error codes and server failures at appropriate levels", async () => {
	const { app, lines, records } = fixture();

	app.get("/provider", async () =>
		fail(502, "PROVIDER_DNS_FAILED", "Hostname unavailable"),
	);

	app.get("/failure", async () => {
		throw new Error("private-database-password");
	});

	try {
		await app.inject("/provider");
		await app.inject("/failure");

		expect(records()).toContainEqual(
			expect.objectContaining({ level: 50, code: "PROVIDER_DNS_FAILED" }),
		);

		expect(records()).toContainEqual(
			expect.objectContaining({ level: 50, code: "INTERNAL_ERROR" }),
		);

		expect(lines.join("")).not.toContain("private-database-password");
	} finally {
		await app.close();
	}
});

it.each(["info", "debug"])(
	"keeps successful health checks quiet except at debug: %s",
	async (level) => {
		const { app, records } = fixture(level);
		app.get("/health", async () => ({ status: "ok" }));

		app.get("/ready", async (_request, reply) =>
			reply.code(503).send({ status: "unavailable" }),
		);

		try {
			await app.inject("/health");
			await app.inject("/ready");

			expect(
				records().filter((row) => row.route === "/health"),
			).toHaveLength(level === "debug" ? 1 : 0);

			expect(records()).toContainEqual(
				expect.objectContaining({
					route: "/ready",
					statusCode: 503,
					level: 50,
				}),
			);
		} finally {
			await app.close();
		}
	},
);

it("identifies failed background runners without leaking thrown errors", async () => {
	const { app, lines, records } = fixture();

	const stop = startRunner(
		async () => {
			throw new Error("private-smtp-password");
		},
		60000,
		{ name: "email-delivery", logger: app.log },
	);

	await stop();

	expect(records()).toContainEqual(
		expect.objectContaining({
			job: "email-delivery",
			level: 50,
			msg: "Background job tick failed",
		}),
	);

	expect(lines.join("")).not.toContain("private-smtp-password");
	await app.close();
});

it("rejects unsupported log levels", () => {
	vi.stubEnv("LOG_LEVEL", "verbose");
	expect(loggingOptions).toThrow("LOG_LEVEL must be");
});
