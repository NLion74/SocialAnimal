import { proxySecretGet } from "../../../../../../lib/secret-proxy";

export function GET(request: Request) {
	return proxySecretGet(
		`/api/v1/connections/google/callback${new URL(request.url).search}`,
	);
}
