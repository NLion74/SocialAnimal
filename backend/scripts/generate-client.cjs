const fs = require("node:fs");

const prettier = require("prettier");

const { buildApp } = require("../dist/app");

function type(s) {
	if (!s) return "void";
	if (s.enum) return s.enum.map((x) => JSON.stringify(x)).join(" | ");

	if (Array.isArray(s.type))
		return s.type.map((t) => type({ ...s, type: t })).join(" | ");

	if (s.type === "null") return "null";
	if (s.type === "string") return "string";
	if (s.type === "integer" || s.type === "number") return "number";
	if (s.type === "boolean") return "boolean";
	if (s.type === "array") return `Array<${type(s.items)}>`;

	if (s.type === "object") {
		const fields = Object.entries(s.properties || {}).map(
			([k, v]) =>
				`${JSON.stringify(k)}${(s.required || []).includes(k) ? "" : "?"}: ${type(v)}`,
		);

		if (
			s.additionalProperties &&
			typeof s.additionalProperties === "object"
		)
			fields.push(`[key: string]: ${type(s.additionalProperties)}`);

		return `{ ${fields.join("; ")} }`;
	}

	throw new Error(`Unsupported schema: ${JSON.stringify(s)}`);
}

(async () => {
	const app = await buildApp();
	const doc = (await app.inject("/api/v1/openapi.json")).json();

	fs.writeFileSync(
		"../docs/openapi.json",
		await prettier.format(JSON.stringify(doc), {
			...(await prettier.resolveConfig("../docs/openapi.json")),
			filepath: "../docs/openapi.json",
		}),
	);

	let out =
		'// Generated from backend runtime schemas. Run npm run client:generate in backend.\nimport { apiClient } from "../api";\n';

	for (const [path, methods] of Object.entries(doc.paths))
		for (const [method, op] of Object.entries(methods)) {
			if (op.operationId === "googleCallback") continue;
			const body = op.requestBody?.content["application/json"].schema;
			const parameters = op.parameters || [];

			const required = parameters
				.filter((x) => x.required)
				.map((x) => x.name);

			const props = Object.fromEntries(
				parameters.map((p) => [p.name, p.schema]),
			);

			if (body) {
				props.body = body;
				required.push("body");
			}

			const input = type({ type: "object", properties: props, required });

			const success = Object.entries(op.responses).find(([code]) =>
				code.startsWith("2"),
			)?.[1];

			const response = type(
				success?.content?.["application/json"]?.schema,
			);

			out += `export type ${op.operationId}Input = ${input};\n\nexport type ${op.operationId}Response = ${response};\n\n`;
			out += `export function ${op.operationId}(${parameters.length || body ? "input" : "_input"}: ${op.operationId}Input${required.length ? "" : " = {}"}): Promise<${op.operationId}Response> {\n`;
			out += `  let path = ${JSON.stringify(path)};\n`;

			for (const p of parameters.filter((p) => p.in === "path"))
				out += `  path = path.replace("{${p.name}}", encodeURIComponent(input.${p.name}));\n`;

			out += "  const query = new URLSearchParams();\n";

			for (const p of parameters.filter((p) => p.in === "query"))
				out += `  if (input.${p.name} !== undefined) query.set("${p.name}", String(input.${p.name}));\n`;

			out += `  return apiClient.request(path + (query.size ? "?" + query : ""), { method: "${method.toUpperCase()}"${body ? ", body: input.body" : ""} });\n}\n\n`;
		}

	const file = "../frontend/lib/generated/client.ts";

	fs.writeFileSync(
		file,
		await prettier.format(out, {
			...(await prettier.resolveConfig(file)),
			filepath: file,
		}),
	);

	await app.close();
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
