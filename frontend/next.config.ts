import type { NextConfig } from "next";

// Where the Express backend is reachable from the Next.js server.
// Read at build time (rewrites are baked into the build output).
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Proxy /api/* to the backend so the browser only talks to one origin
  // and the httpOnly session cookie works without CORS.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  experimental: {
    // AI chat requests can take longer than the 30s default.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
