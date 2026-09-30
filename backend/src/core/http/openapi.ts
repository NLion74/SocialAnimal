import type { FastifyInstance } from "fastify";
import { obj } from "./index";
// The same runtime schemas drive OpenAPI and client generation.
export function documentApi(app: FastifyInstance) {
	const doc = {
		openapi: "3.1.0",
		info: { title: "SocialAnimal REST", version: "1.0.0" },
		components: {
			securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
		},
		paths: {} as Record<string, Record<string, unknown>>,
	};

	app.addHook("onRoute", (route) => {
		if (
			!route.url.startsWith("/api/v1/") ||
			route.url === "/api/v1/openapi.json"
		)
			return;

		const schema = route.schema as Record<string, any> | undefined;
		if (!schema) return;

		const pathFields = Object.fromEntries(
			[...route.url.matchAll(/:([A-Za-z]+)/g)].map((m) => [
				m[1],
				{ type: "string", minLength: 1, maxLength: 2048 },
			]),
		);

		if (Object.keys(pathFields).length && !schema.params)
			schema.params = obj(pathFields);

		const path = route.url.replace(/:([A-Za-z]+)/g, "{$1}");

		const params = [...route.url.matchAll(/:([A-Za-z]+)/g)].map((m) => ({
			name: m[1],
			in: "path",
			required: true,
			schema: schema.params.properties[m[1]],
		}));

		const query = Object.entries(schema.querystring?.properties || {}).map(
			([name, value]) => ({
				name,
				in: "query",
				required: schema.querystring?.required?.includes(name) || false,
				schema: value,
			}),
		);

		const responses = Object.fromEntries(
			Object.entries(schema.response || { 302: { type: "null" } }).map(
				([status, value]) => [
					status,
					{
						description: status,
						...(status === "204"
							? {}
							: {
									content: {
										"application/json": { schema: value },
									},
								}),
					},
				],
			),
		);

		for (const method of [route.method].flat()) {
			if (method === "HEAD") continue;

			(doc.paths[path] ||= {})[method.toLowerCase()] = {
				operationId: schema.operationId || "googleCallback",
				parameters: [...params, ...query],
				...(![
					"/api/v1/auth/registrations",
					"/api/v1/auth/sessions",
					"/api/v1/settings/public",
					"/api/v1/connections/google/callback",
				].includes(route.url)
					? { security: [{ bearerAuth: [] }] }
					: {}),
				...(schema.body
					? {
							requestBody: {
								required: true,
								content: {
									"application/json": { schema: schema.body },
								},
							},
						}
					: {}),
				responses,
			};
		}
	});

	app.get("/api/v1/openapi.json", async () => doc);
	return doc;
}
