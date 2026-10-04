/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	logging: {
		incomingRequests: false,
		fetches: { fullUrl: false },
		serverFunctions: false,
	},
	allowedDevOrigins: ["127.0.0.1"],
	distDir: process.env.NEXT_DIST_DIR || ".next",
	async headers() {
		return [
			{
				source: "/:page(shared|verify-email|register|reset-password|forgot-password)",
				headers: [
					{ key: "Referrer-Policy", value: "no-referrer" },
					{ key: "X-Robots-Tag", value: "noindex, nofollow" },
					{ key: "Cache-Control", value: "no-store" },
					{
						key: "Content-Security-Policy",
						value: "frame-ancestors 'none'",
					},
				],
			},
		];
	},
	async rewrites() {
		const backendUrl = process.env.BACKEND_URL || "http://backend:4000";

		return [
			{
				source: "/api/:path*",
				destination: `${backendUrl}/api/:path*`,
			},
		];
	},
};

export default nextConfig;
