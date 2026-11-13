import { proxySecretGet } from "../../../../../lib/secret-proxy";

export function GET(request: Request) {
	return proxySecretGet(
		`/api/providers/google/callback${new URL(request.url).search}`,
	);
}
