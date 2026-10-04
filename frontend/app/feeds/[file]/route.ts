import { proxySecretGet } from "../../../lib/secret-proxy";

export async function GET(
	_request: Request,
	context: { params: Promise<{ file: string }> },
) {
	const { file } = await context.params;
	return proxySecretGet(`/feeds/${encodeURIComponent(file)}`);
}
