/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    async rewrites() {
        const backendUrl =
            process.env.BACKEND_URL ||
            (process.env.NODE_ENV === "development"
                ? "http://localhost:3001"
                : "");

        return [
            {
                source: "/api/:path*",
                destination: `${backendUrl}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;
