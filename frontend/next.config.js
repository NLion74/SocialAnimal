/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	allowedDevOrigins: ["127.0.0.1"],
	distDir: process.env.NEXT_DIST_DIR || ".next",
	async headers() {
		return [
			{
				source: "/shared",
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
				source: "/feeds/:path*",
				destination: `${backendUrl}/feeds/:path*`,
			},
			{
				source: "/api/:path*",
				destination: `${backendUrl}/api/:path*`,
			},
		];
	},
};

export default nextConfig;
