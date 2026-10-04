import type { FastifyInstance } from "fastify";

export function loggingOptions() {
	const level =
		process.env.LOG_LEVEL ||
		(process.env.NODE_ENV === "test" ? "silent" : "info");

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
			// Upstream error messages and stacks can contain credentials or email contents.
			err: () => ({
				type: "Error",
				message: "Error details omitted",
				stack: "",
			}),
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
			],
			remove: true,
		},
	};
}

export function logRequests(app: FastifyInstance) {
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
