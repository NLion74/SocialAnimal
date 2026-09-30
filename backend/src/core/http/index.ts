import type { FastifyInstance, FastifySchema } from "fastify";

export class HttpError extends Error {
	constructor(
		public statusCode: number,
		public code: string,
		message: string,
	) {
		super(message);
	}
}

export const fail = (status: number, code: string, message: string): never => {
	throw new HttpError(status, code, message);
};

export const str = { type: "string" } as const;

export const nullableString = { type: ["string", "null"] };

export const bool = { type: "boolean" } as const;

export const integer = { type: "integer" } as const;

export const date = { type: "string", format: "date-time" } as const;

export const obj = (
	properties: Record<string, unknown>,
	required = Object.keys(properties),
) => ({ type: "object", additionalProperties: false, properties, required });

export const array = (items: unknown) => ({ type: "array", items });

export const list = (items: unknown) =>
	obj({ items: array(items), nextCursor: nullableString });

export const pageQuery = {
	limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
	cursor: str,
};

export type PageQuery = { limit?: number; cursor?: string };

export const pageArgs = ({ limit = 100, cursor }: PageQuery) => ({
	take: limit + 1,
	...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
	orderBy: { id: "asc" as const },
});

export function page<T extends { id: string }>(
	rows: T[],
	{ limit = 100 }: PageQuery,
) {
	return {
		items: rows.slice(0, limit),
		nextCursor: rows.length > limit ? rows[limit - 1].id : null,
	};
}

export const errorSchema = obj({ code: str, message: str, requestId: str });

export function contract(
	operationId: string,
	response: unknown,
	extra: FastifySchema = {},
	status = 200,
): FastifySchema {
	return {
		operationId,
		...extra,
		response: {
			[status]: response,
			400: errorSchema,
			401: errorSchema,
			403: errorSchema,
			404: errorSchema,
			409: errorSchema,
			422: errorSchema,
			500: errorSchema,
			502: errorSchema,
			503: errorSchema,
		},
	} as FastifySchema;
}

export function errors(app: FastifyInstance) {
	app.setErrorHandler((error, request, reply) => {
		const e = error as HttpError & { validation?: unknown };

		const status = e.validation
			? 400
			: e.statusCode || (e.code === "P2002" ? 409 : 500);

		reply.status(status).send({
			code: e.validation
				? "INVALID_REQUEST"
				: status === 500
					? "INTERNAL_ERROR"
					: e.code || "REQUEST_FAILED",
			message:
				status === 500
					? "Request failed"
					: e.code === "P2002"
						? "Resource already exists"
						: e.message,
			requestId: request.id,
		});
	});

	app.setNotFoundHandler((req, reply) =>
		reply.code(404).send({
			code: "NOT_FOUND",
			message: "Route not found",
			requestId: req.id,
		}),
	);
}
