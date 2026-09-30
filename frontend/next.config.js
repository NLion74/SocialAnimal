/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	distDir: process.env.NEXT_DIST_DIR || ".next",
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
