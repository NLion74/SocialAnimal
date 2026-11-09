import type { FastifyInstance } from "fastify";
import { getSystemErrorMap } from "node:util";

const errorCodes = new Set([
	...Array.from(getSystemErrorMap().values(), ([name]) => name),
	"ENOTFOUND",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"UND_ERR_SOCKET",
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"CERT_HAS_EXPIRED",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"ERR_WORKER_OUT_OF_MEMORY",
	"EAUTH",
	"ECONNECTION",
	"ETLS",
]);

// Error messages, arbitrary properties and raw stacks can contain upstream secrets.
function safeError(error: unknown, verbose: boolean) {
	const pending = [error];
	const seen = new Set<unknown>();
	const codes = new Set<string>();
	const locations = new Set<string>();

	for (let i = 0; pending.length && i < 16; i++) {
		const item = pending.shift();
		if (!item || typeof item !== "object" || seen.has(item)) continue;
		seen.add(item);
		const value = item as {
			code?: unknown;
			stack?: unknown;
			cause?: unknown;
			errors?: unknown[];
		};

		if (
			typeof value.code === "string" &&
			(errorCodes.has(value.code) || /^P\d{4}$/.test(value.code))
		)
			codes.add(value.code);

		if (verbose && typeof value.stack === "string") {
			for (const line of value.stack.split("\n").slice(1, 16)) {
				const location = line.match(
					/\/(src|dist)\/([a-zA-Z0-9_./-]+\.[cm]?[jt]s:\d+:\d+)\)?$/,
				);
				if (line.trimStart().startsWith("at ") && location)
					locations.add(`${location[1]}/${location[2]}`);
			}
		}

		pending.push(
			value.cause,
			...(Array.isArray(value.errors) ? value.errors.slice(0, 8) : []),
		);
	}

	return {
		type: "Error",
		message: "Error details omitted",
		stack: "",
		codes: [...codes],
		...(verbose ? { locations: [...locations].slice(0, 12) } : {}),
	};
}

export function loggingOptions() {
	const mode =
		process.env.LOG_MODE ||
		(process.env.NODE_ENV === "development" ? "verbose" : "production");

	if (!["production", "verbose"].includes(mode))
		throw new Error("LOG_MODE must be production or verbose");

	const level =
		process.env.LOG_LEVEL ||
		(process.env.NODE_ENV === "test"
			? "silent"
			: mode === "verbose"
				? "debug"
				: "info");

	if (
		![
			"fatal",
			"error",
			"warn",
			"info",
			"debug",
			"trace",
			"silent",
		].includes(level)
	)
		throw new Error(
			"LOG_LEVEL must be fatal, error, warn, info, debug, trace, or silent",
		);

	return {
		level,
		base: {
			service: "socialanimal-backend",
			logMode: mode,
			pid: process.pid,
		},
		serializers: {
			// Route templates retain diagnostic value without exposing feed tokens or OAuth queries.
			req: (request: {
				method: string;
				routeOptions?: { url?: string };
			}) => ({
				method: request.method,
				route: request.routeOptions?.url || "unmatched",
			}),
			res: (reply: { statusCode: number }) => ({
				statusCode: reply.statusCode,
			}),
			err: (error: unknown) => safeError(error, mode === "verbose"),
		},
		redact: {
			paths: [
				"authorization",
				"cookie",
				"password",
				"credentials",
				"token",
				"payload",
				"body",
				"headers",
				"query",
				"params",
				"secret",
				"accessToken",
				"refreshToken",
				"email",
			].flatMap((key) => [key, `*.${key}`]),
			remove: true,
		},
	};
}

// Startup can fail before Fastify has a logger (including invalid log settings).
export function logProcessFailure(message: string, error: unknown) {
	let verbose = false;

	try {
		verbose = loggingOptions().base.logMode === "verbose";
	} catch {
		// Configuration failures must remain observable even if logging is misconfigured.
	}

	console.error(
		JSON.stringify({
			level: 50,
			time: Date.now(),
			service: "socialanimal-backend",
			err: safeError(error, verbose),
			msg: message,
		}),
	);
}

export function logRequests(app: FastifyInstance) {
	app.addHook("onRequest", async (request) => {
		request.log.debug(
			{
				method: request.method,
				route: request.routeOptions.url || "unmatched",
			},
			"Request started",
		);
	});

	app.addHook("onResponse", async (request, reply) => {
		const route = request.routeOptions.url || "unmatched";
		const statusCode = reply.statusCode;

		const level =
			statusCode >= 500
				? "error"
				: statusCode >= 400
					? "warn"
					: ["/health", "/ready"].includes(route)
						? "debug"
						: "info";

		request.log[level](
			{
				method: request.method,
				route,
				statusCode,
				durationMs: Math.round(reply.elapsedTime * 100) / 100,
			},
			"Request completed",
		);
	});
}
