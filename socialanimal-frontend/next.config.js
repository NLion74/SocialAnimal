/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    async rewrites() {
        const isDev = process.env.NODE_ENV === "development";
        const backendUrl = isDev
            ? "http://localhost:3001"
            : process.env.BACKEND_URL || "";

        return [
            {
                source: "/api/:path*",
                destination: `${backendUrl}/api/:path*`,
            },
        ];
    },
};

module.exports = nextConfig;
