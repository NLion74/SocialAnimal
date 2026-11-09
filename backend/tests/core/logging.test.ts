import Fastify, { LogController } from "fastify";
import { Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import {
	loggingOptions,
	logRequests,
	logProcessFailure,
} from "../../src/core/http/logging";
import { errors, fail } from "../../src/core/http";
import { startRunner } from "../../src/core/jobs";

afterEach(() => vi.unstubAllEnvs());

function fixture(level = "info", mode = "production") {
	vi.stubEnv("LOG_LEVEL", level);
	vi.stubEnv("LOG_MODE", mode);
	vi.stubEnv("NODE_ENV", "production");
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

it.each(["production", "verbose"])(
	"%s logs omit path tokens, query strings, headers, and bodies",
	async (mode) => {
		const { app, lines, records } = fixture("debug", mode);

		app.post("/feeds/:token.ics", async (request, reply) => {
			request.log.info(
				{
					req: request,
					res: reply,
					err: new Error("private-error"),
					credentials: "private-credentials",
					context: {
						token: "private-nested-token",
						password: "private-nested-password",
					},
				},
				"Safe serialization",
			);

			return { ok: true };
		});

		app.get("/api/v1/connections/google/callback", async () => ({
			ok: true,
		}));

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
	},
);

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
			).toHaveLength(level === "debug" ? 2 : 0);

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

it.each(["production", "verbose"])(
	"%s preserves safe cause codes without upstream secrets",
	async (mode) => {
		const { app, records, lines } = fixture("", mode);
		const cause = Object.assign(new Error("private-provider-url"), {
			code: "EAI_AGAIN",
		});
		cause.stack =
			"Error: private-provider-url\n    at lookup (/app/src/core/http/provider-fetch.ts:40:2)\n    at secret (https://private-token.test:3:4)";
		const error = Object.assign(new Error("private-message"), { cause });
		Object.assign(cause, { cause: error });
		app.get("/provider", async () =>
			fail(502, "PROVIDER_DNS_FAILED", "DNS unavailable", error),
		);

		try {
			await app.inject("/provider");
			const failed = records().find(
				(record) => record.msg === "Request failed",
			);
			expect(failed.err.codes).toEqual(["EAI_AGAIN"]);
			expect(failed.logMode).toBe(mode);
			expect(failed.service).toBe("socialanimal-backend");
			if (mode === "verbose")
				expect(failed.err.locations).toContain(
					"src/core/http/provider-fetch.ts:40:2",
				);
			else expect(failed.err.locations).toBeUndefined();
			expect(
				records().some((record) => record.msg === "Request started"),
			).toBe(mode === "verbose");
			expect(lines.join("")).not.toContain("private-");
		} finally {
			await app.close();
		}
	},
);

it("uses environment defaults and respects explicit level overrides", () => {
	vi.stubEnv("LOG_MODE", "");
	vi.stubEnv("LOG_LEVEL", "");
	vi.stubEnv("NODE_ENV", "development");
	expect(loggingOptions().level).toBe("debug");
	vi.stubEnv("NODE_ENV", "production");
	expect(loggingOptions().level).toBe("info");
	vi.stubEnv("LOG_MODE", "verbose");
	expect(loggingOptions().level).toBe("debug");
	vi.stubEnv("LOG_LEVEL", "warn");
	expect(loggingOptions().level).toBe("warn");
});

it("rejects unsupported logging modes", () => {
	vi.stubEnv("LOG_MODE", "invalid");
	expect(loggingOptions).toThrow("LOG_MODE must be");
});

it("emits safe structured startup failures even with invalid logger settings", () => {
	vi.stubEnv("LOG_MODE", "invalid");
	const output = vi.spyOn(console, "error").mockImplementation(() => {});

	try {
		logProcessFailure(
			"Database setup failed",
			Object.assign(new Error("private-database-url"), {
				code: "ENOTFOUND",
			}),
		);
		const line = output.mock.calls[0][0];
		expect(JSON.parse(line)).toMatchObject({
			level: 50,
			service: "socialanimal-backend",
			err: { codes: ["ENOTFOUND"] },
			msg: "Database setup failed",
		});
		expect(line).not.toContain("private-");
	} finally {
		output.mockRestore();
	}
});
